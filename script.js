// =================================================================
// 定数と変数
// =================================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const speedGraphCanvas = document.getElementById('speedGraphCanvas');
const graphCtx = speedGraphCanvas.getContext('2d');

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;
const GRAPH_WIDTH = speedGraphCanvas.width;
const GRAPH_HEIGHT = speedGraphCanvas.height;

// 木星の軌道半径に基づくシミュレーションスケール
//const JUPITER_ORBIT_RADIUS_KM = 778000000;
const SIMULATION_REGION_WIDTH_KM = 50000000; 
const SIMULATION_REGION_HEIGHT_KM = 50000000;
const SCALE_FACTOR_KM_PER_PX = SIMULATION_REGION_WIDTH_KM / CANVAS_WIDTH;

const G = 6.67430e-20; // km^3 / kg / s^2
const JUPITER_MASS = 1.898e27; // kg
const SATELLITE_MASS = 722; // kg

// 全体30秒に収まるように
const SIMULATION_DURATION_SEC = 31536000; // 1年 (秒)
const REAL_TIME_DURATION_SEC = 30;
const TIME_SCALE_FACTOR = SIMULATION_DURATION_SEC / REAL_TIME_DURATION_SEC;
const baseTimeStep = TIME_SCALE_FACTOR / 60;

let animationId = null;
let isGameRunning = false;
let isSatelliteSet = false;
let isDragging = false;
let satelliteInitialPosition = null;

let satelliteTrail = [];
const TRAIL_MAX_LENGTH = 500;

let simulationTime = 0;
let speedData = [];
const GRAPH_DATA_LENGTH = 500;
let MAX_SPEED_Y_AXIS = 10;

const startButton = document.getElementById('startButton');
const resetButton = document.getElementById('resetButton');
const currentSpeedSpan = document.getElementById('currentSpeed');
const resultDisplay = document.getElementById('resultDisplay');

// =================================================================
// ベクトルクラス
// =================================================================
class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    add(v) { return new Vector(this.x + v.x, this.y + v.y); }
    subtract(v) { return new Vector(this.x - v.x, this.y - v.y); }
    multiply(scalar) { return new Vector(this.x * scalar, this.y * scalar); }
    magnitude() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalize() {
        const mag = this.magnitude();
        return mag > 0 ? new Vector(this.x / mag, this.y / mag) : new Vector(0, 0);
    }
}
// =================================================================
// オブジェクトの初期状態
// =================================================================
const initialJupiter = {
    position: new Vector(0, SIMULATION_REGION_HEIGHT_KM / 2 * 0.9), // 上部中央に寄せる
    velocity: new Vector(0, -13.07), // 木星の公転速度に近づける (km/s)
    mass: JUPITER_MASS,
    radius: 69911 // km
};

const initialSatellite = {
    position: new Vector(0, 0),
    velocity: new Vector(0, 0),
    mass: SATELLITE_MASS,
    radius: 300 // km (視覚用)
};

let jupiter = { ...initialJupiter };
let satellite = { ...initialSatellite };

// =================================================================
// 座標変換関数
// =================================================================
function toPixelX(xKm) {
    return Math.round((xKm / SCALE_FACTOR_KM_PER_PX) + CANVAS_WIDTH / 2);
}
function toPixelY(yKm) {
    return Math.round(CANVAS_HEIGHT / 2 - (yKm / SCALE_FACTOR_KM_PER_PX));
}
function toKmX(xPx) {
    return (xPx - CANVAS_WIDTH / 2) * SCALE_FACTOR_KM_PER_PX;
}
function toKmY(yPx) {
    return (CANVAS_HEIGHT / 2 - yPx) * SCALE_FACTOR_KM_PER_PX;
}

// =================================================================
// 描画関数
// =================================================================
function drawObject(obj, color) {
    const x = toPixelX(obj.position.x);
    const y = toPixelY(obj.position.y);
    const radius = (obj === jupiter) ? 10 : 5;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawTrail() {
    ctx.beginPath();
    if (satelliteTrail.length > 0) {
        ctx.moveTo(toPixelX(satelliteTrail[0].x), toPixelY(satelliteTrail[0].y));
        for (let i = 1; i < satelliteTrail.length; i++) {
            ctx.lineTo(toPixelX(satelliteTrail[i].x), toPixelY(satelliteTrail[i].y));
        }
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
        const dotInterval = 15; // ドットを描画する間隔 (フレーム数)
    ctx.fillStyle = 'white';
    for (let i = 0; i < satelliteTrail.length; i += dotInterval) {
        const point = satelliteTrail[i];
        const x = toPixelX(point.x);
        const y = toPixelY(point.y);
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI); // 半径2の白いドットを描画
        ctx.fill();
    }
}

function drawAxes() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    // 原点軸（画面中央）
    ctx.beginPath();
    ctx.moveTo(toPixelX(0), 0);
    ctx.lineTo(toPixelX(0), CANVAS_HEIGHT);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, toPixelY(0));
    ctx.lineTo(CANVAS_WIDTH, toPixelY(0));
    ctx.stroke();
}

function drawTicksAndLabels() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const tickIntervalKmX = SIMULATION_REGION_WIDTH_KM / 8;
    const tickIntervalKmY = SIMULATION_REGION_HEIGHT_KM / 8;

    const y0 = toPixelY(0);
    for (let i = -4; i <= 4; i++) {
        const xKm = i * tickIntervalKmX;
        const xPx = toPixelX(xKm);
        ctx.beginPath();
        ctx.moveTo(xPx, y0 - 5);
        ctx.lineTo(xPx, y0 + 5);
        ctx.stroke();
        if (i !== 0) {
            ctx.fillText(`${(xKm / 1e6).toFixed(1)} Gm`, xPx, y0 + 8);
        }
    }

    const x0 = toPixelX(0);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let i = -4; i <= 4; i++) {
        const yKm = i * tickIntervalKmY;
        const yPx = toPixelY(yKm);
        ctx.beginPath();
        ctx.moveTo(x0 - 5, yPx);
        ctx.lineTo(x0 + 5, yPx);
        ctx.stroke();
        if (i !== 0) {
            ctx.fillText(`${(yKm / 1e6).toFixed(1)} Gm`, x0 + 8, yPx);
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawAxes();
    drawTicksAndLabels();
    drawObject(jupiter, 'orange');
    drawTrail();
    if (isSatelliteSet) {
        drawObject(satellite, 'white');
    }
}
// =================================================================
// 物理計算とゲームループ
// =================================================================
function update(totalDt) {
    const closeThreshold = SIMULATION_REGION_WIDTH_KM / 5;
    const distanceToJupiter = jupiter.position.subtract(satellite.position).magnitude();

    let subSteps = 1;
    if (distanceToJupiter < closeThreshold) {
        subSteps = Math.min(50, Math.ceil(closeThreshold / distanceToJupiter));
    }
    const dt = totalDt / subSteps;

    for (let i = 0; i < subSteps; i++) {
        const diff = jupiter.position.subtract(satellite.position);
        const r = diff.magnitude();

        if (r < jupiter.radius) {
            satellite.velocity = new Vector(0, 0); // 落下した
            return;
        }

        const F = (G * jupiter.mass * satellite.mass) / (r * r);
        const acc = diff.normalize().multiply(F / satellite.mass);
        satellite.velocity = satellite.velocity.add(acc.multiply(dt));
        satellite.position = satellite.position.add(satellite.velocity.multiply(dt));
        jupiter.position = jupiter.position.add(jupiter.velocity.multiply(dt));
    }
}

function gameLoop() {
    if (!isGameRunning) return;

    const delta = baseTimeStep;
    update(delta);
    simulationTime += delta;

    satelliteTrail.push({ x: satellite.position.x, y: satellite.position.y });
    if (satelliteTrail.length > TRAIL_MAX_LENGTH) {
        satelliteTrail.shift();
    }

    const speed = satellite.velocity.magnitude();
    speedData.push({ time: simulationTime, speed });
    if (speedData.length > GRAPH_DATA_LENGTH) {
        speedData.shift();
    }

    if (speed > MAX_SPEED_Y_AXIS) {
        MAX_SPEED_Y_AXIS = Math.ceil(speed / 5) * 5;
    }

    draw();
    drawGraph();
    currentSpeedSpan.textContent = speed.toFixed(2);

    if (isSatelliteOutOfBounds() || speed === 0) {
        endGame();
    } else {
        animationId = requestAnimationFrame(gameLoop);
    }
}

function isSatelliteOutOfBounds() {
    const margin = 100;
    const x = toPixelX(satellite.position.x);
    const y = toPixelY(satellite.position.y);
    return x < -margin || x > CANVAS_WIDTH + margin || y < -margin || y > CANVAS_HEIGHT + margin;
}

function endGame() {
    cancelAnimationFrame(animationId);
    isGameRunning = false;
    startButton.disabled = true;
    resetButton.disabled = false;

    const speed = satellite.velocity.magnitude();
    const distanceToJupiter = jupiter.position.subtract(satellite.position).magnitude();

    if (speed === 0) {
        resultDisplay.textContent = 'ミッション失敗！木星に墜落しました（成績: F）';
        return;
    }

    // 新しい脱出判定
    // 脱出速度を計算
    const escapeVelocity = Math.sqrt((2 * G * jupiter.mass) / distanceToJupiter);

    if (speed > escapeVelocity) {
        // 脱出成功
        const grade = evaluatePerformance(speed);
        resultDisplay.textContent = `ミッション完了！最終速さ: ${speed.toFixed(2)} km/s。木星の脱出速度: ${escapeVelocity.toFixed(2)} km/s（成績: ${grade}）`;
    } else {
        // 脱出失敗
        resultDisplay.textContent = '脱出速度に達しませんでした。木星の重力に捕らえられます。（成績: F）';
    }
}

function evaluatePerformance(speed) {
    if (speed >= 20) return 'S';
    if (speed >= 18) return 'A';
    if (speed >= 16) return 'B';
    if (speed >= 14) return 'C';
    return 'F';
}
// =================================================================
// ユーザー操作イベント
// =================================================================
function getMousePositionInCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

canvas.addEventListener('mousedown', (e) => {
    if (isGameRunning || isSatelliteSet) return;
    const { x, y } = getMousePositionInCanvas(e);
    const edge = getMouseEdge(x, y);
    if (edge) {
        isDragging = true;
        satelliteInitialPosition = getPositionOnEdge(x, y, edge);
        satellite.position = new Vector(satelliteInitialPosition.x, satelliteInitialPosition.y);
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isGameRunning) return;
    draw();
    drawGraph();

    const { x, y } = getMousePositionInCanvas(e);

    if (isDragging) {
        drawObject({ position: satelliteInitialPosition }, 'gray');
        ctx.beginPath();
        ctx.moveTo(toPixelX(satelliteInitialPosition.x), toPixelY(satelliteInitialPosition.y));
        ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
    } else if (!isSatelliteSet) {
        const edge = getMouseEdge(x, y);
        if (edge) {
            const preview = getPositionOnEdge(x, y, edge);
            drawObject({ position: preview }, 'gray');
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const { x, y } = getMousePositionInCanvas(e);
    const current = new Vector(toKmX(x), toKmY(y));
    const dir = current.subtract(satelliteInitialPosition);

    if (dir.magnitude() > 0) {
        satellite.velocity = dir.normalize().multiply(10);
        isSatelliteSet = true;
        startButton.disabled = false;
    } else {
        isSatelliteSet = false;
        startButton.disabled = true;
    }
    satelliteInitialPosition = null;
    draw();
    drawGraph();
});

function getMouseEdge(x, y) {
    const margin = 20;
    if (x < margin) return 'left';
    if (x > CANVAS_WIDTH - margin) return 'right';
    if (y < margin) return 'top';
    if (y > CANVAS_HEIGHT - margin) return 'bottom';
    return null;
}

function getPositionOnEdge(xPx, yPx, edge) {
    const xKm = toKmX(xPx);
    const yKm = toKmY(yPx);

    if (edge === 'left') return new Vector(-SIMULATION_REGION_WIDTH_KM / 2, yKm);
    if (edge === 'right') return new Vector(SIMULATION_REGION_WIDTH_KM / 2, yKm);
    if (edge === 'top') return new Vector(xKm, SIMULATION_REGION_HEIGHT_KM / 2);
    if (edge === 'bottom') return new Vector(xKm, -SIMULATION_REGION_HEIGHT_KM / 2);
    return null;
}

// =================================================================
// ボタンイベントと初期化
// =================================================================
startButton.addEventListener('click', () => {
    if (isSatelliteSet && !isGameRunning) {
        isGameRunning = true;
        startButton.disabled = true;
        resetButton.disabled = false;
        resultDisplay.textContent = '';
        speedData = [];
        simulationTime = 0;
        MAX_SPEED_Y_AXIS = 10;
        drawGraph();
        animationId = requestAnimationFrame(gameLoop);
    }
});

resetButton.addEventListener('click', () => {
    cancelAnimationFrame(animationId);
    isGameRunning = false;
    isSatelliteSet = false;
    isDragging = false;
    startButton.disabled = true;
    resetButton.disabled = false;

    jupiter = { ...initialJupiter };
    satellite = { ...initialSatellite };
    satelliteTrail = [];
    speedData = [];
    simulationTime = 0;
    MAX_SPEED_Y_AXIS = 10;

    currentSpeedSpan.textContent = '0.00';
    resultDisplay.innerHTML = '<b>人工衛星を木星とのスイングバイで初速の10 km/sから20 km/s以上に加速しよう</b><br><br>計算領域境界付近をクリックしてドラッグすることで、<br>衛星を打ち込む位置と方向を設定し「開始」ボタンを押してください。<br>';

    draw();
    drawGraph();
});

window.addEventListener('load', () => {
    resetButton.click();
});

function drawGraph() {
    graphCtx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
    if (speedData.length < 2) return;

    // データ範囲取得
    let minTime = speedData[0].time;
    let maxTime = speedData[speedData.length - 1].time; // 最後に変更した箇所
    let minSpeed = 0;
    let maxSpeed = 10;
    for (let i = 0; i < speedData.length; i++) {
        if (speedData[i].speed > maxSpeed) {
            maxSpeed = speedData[i].speed;
        }
    }
    maxSpeed = Math.ceil(maxSpeed / 5) * 5;
    if (maxSpeed < 10) maxSpeed = 10;
    const timeRange = maxTime - minTime;
    
    // ----------------------------------------
    // ▼ ここから横軸の描画ロジックを置き換える
    // ----------------------------------------
    let timeLabel, timeDivisor;

    if (timeRange > 240 * 60 * 60) { // 240時間 = 10日
        timeLabel = '時間 [日]';
        timeDivisor = 24 * 60 * 60;
    } else if (timeRange > 60 * 60) { // 60分 = 1時間
        timeLabel = '時間 [時間]';
        timeDivisor = 60 * 60;
    } else if (timeRange > 60) { // 60秒 = 1分
        timeLabel = '時間 [分]';
        timeDivisor = 60;
    } else {
        timeLabel = '時間 [秒]';
        timeDivisor = 1;
    }
    
    // 軸の描画
    graphCtx.strokeStyle = 'white';
    graphCtx.lineWidth = 1;
    graphCtx.beginPath();
    graphCtx.moveTo(50, 10);
    graphCtx.lineTo(50, GRAPH_HEIGHT - 30);
    graphCtx.lineTo(GRAPH_WIDTH - 10, GRAPH_HEIGHT - 30);
    graphCtx.stroke();

    // 目盛り・ラベル
    graphCtx.font = '12px Arial';
    graphCtx.fillStyle = '#ccc';

    // 縦軸（速度）
    const yTicks = 5;
    graphCtx.textAlign = 'right';
    graphCtx.textBaseline = 'middle';
    for (let i = 0; i <= yTicks; i++) {
        const speed = minSpeed + (maxSpeed - minSpeed) * (i / yTicks);
        const y = GRAPH_HEIGHT - 30 - ((speed - minSpeed) / (maxSpeed - minSpeed)) * (GRAPH_HEIGHT - 40);
        graphCtx.fillText(speed.toFixed(2), 45, y);
        graphCtx.strokeStyle = 'rgba(255,255,255,0.08)';
        graphCtx.beginPath();
        graphCtx.moveTo(50, y);
        graphCtx.lineTo(GRAPH_WIDTH - 10, y);
        graphCtx.stroke();
    }
    graphCtx.save();
    graphCtx.translate(18, 30);
    graphCtx.rotate(-Math.PI / 2);
    graphCtx.textAlign = 'center';
    graphCtx.textBaseline = 'top';
    graphCtx.fillText('速度 [km/s]', 0, 0);
    graphCtx.restore();

    // 横軸（時間）
    const xTicks = 5;
    graphCtx.textAlign = 'center';
    graphCtx.textBaseline = 'top';
    for (let i = 0; i <= xTicks; i++) {
        const t = minTime + (timeRange * (i / xTicks));
        const x = 50 + ((t - minTime) / timeRange) * (GRAPH_WIDTH - 60);
        graphCtx.fillText((t / timeDivisor).toFixed(1), x, GRAPH_HEIGHT - 25);
        graphCtx.strokeStyle = 'rgba(255,255,255,0.08)';
        graphCtx.beginPath();
        graphCtx.moveTo(x, 10);
        graphCtx.lineTo(x, GRAPH_HEIGHT - 30);
        graphCtx.stroke();
    }
    // 横軸ラベルの表示
    graphCtx.textAlign = 'right';
    graphCtx.textBaseline = 'bottom';
    graphCtx.fillText(timeLabel, GRAPH_WIDTH - 12, GRAPH_HEIGHT - 32);

    // グラフ描画
    graphCtx.strokeStyle = 'lime';
    graphCtx.beginPath();
    for (let i = 0; i < speedData.length; i++) {
        const x = 50 + ((speedData[i].time - minTime) / timeRange) * (GRAPH_WIDTH - 60);
        const y = GRAPH_HEIGHT - 30 - ((speedData[i].speed - minSpeed) / (maxSpeed - minSpeed)) * (GRAPH_HEIGHT - 40);
        if (i === 0) {
            graphCtx.moveTo(x, y);
        } else {
            graphCtx.lineTo(x, y);
        }
    }
    graphCtx.stroke();
}

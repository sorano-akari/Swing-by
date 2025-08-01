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

const JUPITER_ORBIT_RADIUS_KM = 778000000;
const SIMULATION_REGION_WIDTH_KM = JUPITER_ORBIT_RADIUS_KM / 10;
const SIMULATION_REGION_HEIGHT_KM = (SIMULATION_REGION_WIDTH_KM / CANVAS_WIDTH) * CANVAS_HEIGHT;
const SCALE_FACTOR_KM_PER_PX = SIMULATION_REGION_WIDTH_KM / CANVAS_WIDTH;

const G = 6.67430e-20;
const JUPITER_MASS = 1.898e27;
const SATELLITE_MASS = 722;

const SIMULATION_DURATION_SEC = 109405800;
const REAL_TIME_DURATION_SEC = 60;
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
const resultDisplay = document.getElementById('resultDisplay'); // IDで取得するように修正

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
    position: new Vector(0, SIMULATION_REGION_HEIGHT_KM / 2),
    velocity: new Vector(0, -5),
    mass: JUPITER_MASS,
    radius: 69911
};

const initialSatellite = {
    position: new Vector(0, 0),
    velocity: new Vector(0, 0),
    mass: SATELLITE_MASS,
    radius: 300
};

let jupiter = { ...initialJupiter };
let satellite = { ...initialSatellite };

// =================================================================
// 座標変換と描画
// =================================================================
function toPixelX(xKm) {
    return (xKm / SCALE_FACTOR_KM_PER_PX) + (CANVAS_WIDTH / 2);
}

function toPixelY(yKm) {
    return (CANVAS_HEIGHT / 2) - (yKm / SCALE_FACTOR_KM_PER_PX);
}

function toKmX(xPx) {
    return (xPx - CANVAS_WIDTH / 2) * SCALE_FACTOR_KM_PER_PX;
}

function toKmY(yPx) {
    return (CANVAS_HEIGHT / 2 - yPx) * SCALE_FACTOR_KM_PER_PX;
}

function drawObject(obj, color) {
    const x = toPixelX(obj.position.x);
    const y = toPixelY(obj.position.y);
    let radius;

    if (obj === jupiter) {
        radius = 10;
    } else {
        radius = 5;
    }

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
}

function drawAxes() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    // Y軸を計算領域の左右中央に描画
    ctx.beginPath();
    ctx.moveTo(toPixelX(0), 0);
    ctx.lineTo(toPixelX(0), CANVAS_HEIGHT);
    ctx.stroke();

    // X軸を計算領域の上下中央に描画
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

    const tickIntervalKm_x = SIMULATION_REGION_WIDTH_KM / 8;
    const tickIntervalKm_y = SIMULATION_REGION_HEIGHT_KM / 8;

    // X軸の目盛りとラベル
    const xAxisYPx = toPixelY(0);
    for (let i = -4; i <= 4; i++) {
        const xKm = i * tickIntervalKm_x;
        const xPx = toPixelX(xKm);
        ctx.beginPath();
        ctx.moveTo(xPx, xAxisYPx - 5);
        ctx.lineTo(xPx, xAxisYPx + 5);
        ctx.stroke();
        if (i !== 0) {
            ctx.fillText(`${(xKm/1000000).toFixed(2)} Gm`, xPx, xAxisYPx + 8);
        }
    }

    // Y軸の目盛りとラベル
    const yAxisXPx = toPixelX(0);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let i = -4; i <= 4; i++) {
        const yKm = i * tickIntervalKm_y;
        const yPx = toPixelY(yKm);
        ctx.beginPath();
        ctx.moveTo(yAxisXPx - 5, yPx);
        ctx.lineTo(yAxisXPx + 5, yPx);
        ctx.stroke();
        if (i !== 0) {
            ctx.fillText(`${(yKm/1000000).toFixed(2)} Gm`, yAxisXPx + 8, yPx);
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

function drawGraph() {
    graphCtx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
    
    graphCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    graphCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    graphCtx.font = '10px Arial';
    graphCtx.textAlign = 'left';
    graphCtx.textBaseline = 'top';
    
    const margin = 30;
    const graphWidth = GRAPH_WIDTH - margin * 2;
    const graphHeight = GRAPH_HEIGHT - margin * 2;

    // Y軸
    graphCtx.beginPath();
    graphCtx.moveTo(margin, margin);
    graphCtx.lineTo(margin, GRAPH_HEIGHT - margin);
    graphCtx.stroke();
    graphCtx.fillText('速度 (km/s)', margin + 5, 5);
    
    const yTickInterval = 5;
    for (let s = 0; s <= MAX_SPEED_Y_AXIS; s += yTickInterval) {
        const y = GRAPH_HEIGHT - margin - (s / MAX_SPEED_Y_AXIS) * graphHeight;
        graphCtx.beginPath();
        graphCtx.moveTo(margin - 5, y);
        graphCtx.lineTo(margin + 5, y);
        graphCtx.stroke();
        graphCtx.fillText(s.toFixed(0), margin - 25, y + 3);
    }
    
    // X軸
    graphCtx.beginPath();
    graphCtx.moveTo(margin, GRAPH_HEIGHT - margin);
    graphCtx.lineTo(GRAPH_WIDTH - margin, GRAPH_HEIGHT - margin);
    graphCtx.stroke();

    if (speedData.length > 1) {
        const firstTime = speedData[0].time;
        const lastTime = speedData[speedData.length - 1].time;
        const totalDisplayedTime = lastTime - firstTime;

        let timeUnit = '秒';
        let timeScale = 1;
        let tickInterval = 5;
        
        if (totalDisplayedTime >= 31536000) {
            timeUnit = '年';
            timeScale = 31536000;
            tickInterval = 1;
        } else if (totalDisplayedTime >= 2592000) {
            timeUnit = 'ヶ月';
            timeScale = 2592000;
            tickInterval = 1;
        } else if (totalDisplayedTime >= 86400) {
            timeUnit = '日';
            timeScale = 86400;
            tickInterval = 1;
        } else if (totalDisplayedTime >= 3600) {
            timeUnit = '時間';
            timeScale = 3600;
            tickInterval = 10;
        } else if (totalDisplayedTime >= 60) {
            timeUnit = '分';
            timeScale = 60;
            tickInterval = 5;
        }
        
        graphCtx.fillText(`時間 (${timeUnit})`, GRAPH_WIDTH - margin - 50, GRAPH_HEIGHT - margin + 5);

        graphCtx.beginPath();
        graphCtx.strokeStyle = 'cyan';
        graphCtx.lineWidth = 1;

        const xStep = graphWidth / totalDisplayedTime;
        const yStep = graphHeight / MAX_SPEED_Y_AXIS;
        
        graphCtx.moveTo(margin, GRAPH_HEIGHT - margin - speedData[0].speed * yStep);

        for (let i = 1; i < speedData.length; i++) {
            const time = speedData[i].time - firstTime;
            const x = margin + (time * xStep);
            const y = GRAPH_HEIGHT - margin - speedData[i].speed * yStep;
            graphCtx.lineTo(x, y);
        }
        graphCtx.stroke();
        
        for (let t = firstTime; t <= lastTime; t += tickInterval * timeScale) {
            const timeOffset = t - firstTime;
            const x = margin + (timeOffset * xStep);
            if (x > margin) {
                graphCtx.beginPath();
                graphCtx.moveTo(x, GRAPH_HEIGHT - margin);
                graphCtx.lineTo(x, GRAPH_HEIGHT - margin + 5);
                graphCtx.stroke();
                graphCtx.fillText((t / timeScale).toFixed(1), x - 10, GRAPH_HEIGHT - margin + 15);
            }
        }
    }
}

// =================================================================
// 物理計算とゲームロジック
// =================================================================
function update(totalDt) {
    const closeDistanceThreshold = SIMULATION_REGION_WIDTH_KM / 5;
    const distanceToJupiter = jupiter.position.subtract(satellite.position).magnitude();
    
    let subSteps = 1;
    if (distanceToJupiter < closeDistanceThreshold) {
        subSteps = Math.ceil(closeDistanceThreshold / distanceToJupiter);
        if (subSteps > 50) {
            subSteps = 50;
        }
    }
    const subDt = totalDt / subSteps;

    for (let i = 0; i < subSteps; i++) {
        const distanceVector = jupiter.position.subtract(satellite.position);
        const distance = distanceVector.magnitude();

        if (distance < jupiter.radius) {
            satellite.velocity = new Vector(0, 0);
            return;
        }

        const forceMagnitude = (G * jupiter.mass * satellite.mass) / (distance * distance);
        const forceDirection = distanceVector.normalize();
        const force = forceDirection.multiply(forceMagnitude);
        const acceleration = force.multiply(1 / satellite.mass);

        satellite.velocity = satellite.velocity.add(acceleration.multiply(subDt));
        satellite.position = satellite.position.add(satellite.velocity.multiply(subDt));

        jupiter.position = jupiter.position.add(jupiter.velocity.multiply(subDt));
    }
}

function isSatelliteOutOfBounds() {
    const margin = 50;
    const x = toPixelX(satellite.position.x);
    const y = toPixelY(satellite.position.y);
    return x < -margin || x > CANVAS_WIDTH + margin || y < -margin || y > CANVAS_HEIGHT + margin;
}

function evaluatePerformance() {
    const finalSpeed = satellite.velocity.magnitude();
    if (finalSpeed >= 20) return { grade: 'S', speed: finalSpeed.toFixed(2) };
    if (finalSpeed >= 18) return { grade: 'A', speed: finalSpeed.toFixed(2) };
    if (finalSpeed >= 16) return { grade: 'B', speed: finalSpeed.toFixed(2) };
    if (finalSpeed >= 10) return { grade: 'C', speed: finalSpeed.toFixed(2) };
    return { grade: 'F', speed: finalSpeed.toFixed(2) };
}

function endGame() {
    cancelAnimationFrame(animationId);
    isGameRunning = false;
    startButton.disabled = true;
    resetButton.disabled = false;

    // 「評価」ヘッダーはHTML側にあるので、本文のみを挿入
    if (satellite.velocity.magnitude() === 0) {
        resultDisplay.innerHTML = 'ミッション失敗！木星に墜落しました。';
    } else {
        const result = evaluatePerformance();
        resultDisplay.innerHTML = `ミッション完了！<br>最終速さ: ${result.speed} km/s. 成績: ${result.grade}`;
    }
}

function gameLoop() {
    if (!isGameRunning) {
        return;
    }

    const deltaTime = baseTimeStep;
    update(deltaTime);
    simulationTime += baseTimeStep;
    
    satelliteTrail.push({ x: satellite.position.x, y: satellite.position.y });
    if (satelliteTrail.length > TRAIL_MAX_LENGTH) {
        satelliteTrail.shift();
    }
    
    const currentSpeed = satellite.velocity.magnitude();
    speedData.push({ time: simulationTime, speed: currentSpeed });
    if (speedData.length > GRAPH_DATA_LENGTH) {
        speedData.shift();
    }

    if (currentSpeed > MAX_SPEED_Y_AXIS) {
        MAX_SPEED_Y_AXIS = Math.ceil(currentSpeed / 5) * 5;
    }

    draw();
    drawGraph();

    currentSpeedSpan.textContent = currentSpeed.toFixed(2);

    if (isSatelliteOutOfBounds() || satellite.velocity.magnitude() === 0) {
        endGame();
    } else {
        animationId = requestAnimationFrame(gameLoop);
    }
}

// =================================================================
// ユーザーインタラクション
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
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
    } else if (!isSatelliteSet) {
        const edge = getMouseEdge(x, y);
        if (edge) {
            const previewPosition = getPositionOnEdge(x, y, edge);
            drawObject({ position: previewPosition }, 'gray');
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    
    const { x, y } = getMousePositionInCanvas(e);
    const currentPosition = new Vector(toKmX(x), toKmY(y));
    const directionVector = currentPosition.subtract(satelliteInitialPosition);

    if (directionVector.magnitude() > 0) {
        // 速度は常に10 km/sに固定する
        satellite.velocity = directionVector.normalize().multiply(10);
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
// イベントリスナーの初期設定とリセット
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
    // 説明文をHTMLタグを含めずに、より簡潔に
    resultDisplay.innerHTML = `
        木星の重力で衛星を加速させるシミュレーションです。<br>
        **目標**: 初速10 km/sを20 km/s以上に。<br>
        <br>
        **操作方法**<br>
        1. 画面のフチをクリック。<br>
        2. ドラッグして打ち出し方向を調整。<br>
        3. 「開始」ボタンでスタート。
    `;
    
    draw();
    drawGraph();
});

window.addEventListener('load', () => {
    resetButton.click();
});
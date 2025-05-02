/**
 * OpenFZ - Motor do jogo Flatball
 * 
 * Um motor de jogo open-source para futebol 2D multiplayer
 * Desenvolvido com fins educacionais e de livre modificação
 */

// Cores das equipes
const TEAM_COLORS = {
    home: ['#3D3BF3', '#EBEAFF'], 
    away: ['#FF2929', '#FEF3E2']
};

// Configurações padrão do controle
const DEFAULT_SETUP = {
    active: /Mobi|Android/i.test(navigator.userAgent),
    kick: { opacity: 50, marginX: 90, marginY: 90, size: 100 },
    pass: { opacity: 50, marginX: 200, marginY: 50, size: 100 },
    joystick: { opacity: 50, marginX: 70, marginY: 70, size: 130 },
    zoom: { level: 1 },
    hud: { opacity: 1 }
};

/**
 * Elementos da interface do jogo
 */
const elements = {
    // Elementos principais
    canvas: document.getElementById('canvas'),
    camera: document.getElementById('camera'),
    buttons: document.getElementById('buttons'),
    
    // Chat e mensagens
    lastMessage: document.getElementById('lastMessage'),
    inputMessage: document.getElementById('inputMessage'),
    chat: document.getElementById('chatMessages'),
    chatDiv: document.getElementById('chatDiv'),
    
    // Informações do jogo
    ping: document.getElementById('ping'),
    score: document.getElementById('score'),
    scoreboard: document.getElementById('scoreboard'),
    timer: document.getElementById('timer'),
    
    // Overlays e efeitos
    goalOverlay: document.getElementById('goalOverlay'),
    goal: document.getElementById('goal'),
    author: document.getElementById('author'),
    
    // Controles e botões
    exitButton: document.getElementById('exitButton'),
    fullscreenButton: document.getElementById('fullscreenButton'),
    kickButton: document.getElementById('kick'),
    passButton: document.getElementById('pass'),
    joyStick: document.getElementById('joy'),
    
    // Telas e menus
    overlay: document.getElementById('overlay'),
    loader: document.getElementById('loader'),
    homeList: document.getElementById('homeList'),
    awayList: document.getElementById('awayList'),
    spectatorList: document.getElementById('spectatorList'),
    homeButton: document.getElementById('homeButton'),
    spectatorButton: document.getElementById('spectatorButton'),
    homeListContainer: document.getElementById('homeListContainer'),
    awayListContainer: document.getElementById('awayListContainer'),
    awayButton: document.getElementById('awayButton'),
    refereeActionButtons: document.getElementById('refereeActionButtons'),
    refereeButton: document.getElementById('refereeButton'),
    pause: document.getElementById('pauseButton'),
    restart: document.getElementById('restartButton'),
    refereeDiv: document.getElementById('refereeDiv'),
    settingsDiv: document.getElementById('settingsDiv'),
    settingsButton: document.getElementById('settingsButton'),
    
    // Controles de configuração
    range: {
        joystick: {
            opacity: document.getElementById('joystickOpacity'),
            marginX: document.getElementById('joystickMarginX'),
            marginY: document.getElementById('joystickMarginY'),
            size: document.getElementById('joystickSize')
        },
        kick: {
            opacity: document.getElementById('kickOpacity'),
            marginX: document.getElementById('kickMarginX'),
            marginY: document.getElementById('kickMarginY'),
            size: document.getElementById('kickSize')
        },
        pass: {
            opacity: document.getElementById('passOpacity'),
            marginX: document.getElementById('passMarginX'),
            marginY: document.getElementById('passMarginY'),
            size: document.getElementById('passSize')
        },
        zoom: {
            level: document.getElementById('zoomLevel')
        },
        hud: {
            opacity: document.getElementById('hudOpacity')
        }
    },
    
    // Efeitos sonoros
    kickSound: new Audio('../audio/kick.mp3'),
    postSound: new Audio('../audio/post.mp3')
};

// Conexão Socket.io
const socket = io();

// Estado do jogo
let socketId = null;
let cameraX = 0, cameraY = 0;
let screen = { width: window.innerWidth, height: window.innerHeight };
let players = {}, ball = {}, score = {}, room = {};
let keysPressed = {}, kickPressed = false, isKicking = false, passBall = false;
let joystickInstance = null;
let stickAngle = null; 
let currentAngle = null;
let selectedPlayerId = null;

// Configurações do usuário (carrega do localStorage ou usa padrão)
let setup = JSON.parse(localStorage.getItem('setup')) || DEFAULT_SETUP;

// Contexto de renderização
const ctx = elements.canvas.getContext('2d');
elements.canvas.width = 2200;
elements.canvas.height = 1550;

/**
 * Atualiza os controles na tela (joystick e botões)
 */
function updateController() {
    const { joyStick: joy, kickButton: kick, passButton: pass } = elements;
    
    if (!setup.active) {
        // Esconde controles quando inativos
        [joy, kick, pass].forEach(element => element.style.display = 'none');
        
        // Destrói o joystick se existir
        if (joystickInstance) {
            joystickInstance.destroy();
            joystickInstance = null;
        }
        return;
    }

    // Configura o joystick
    if (joystickInstance) {
        joystickInstance.update({ size: setup.joystick.size });
    } else {
        joystickInstance = new JoyStick('joy', { size: setup.joystick.size }, handleStickMove);
    }

    // Aplica estilos aos controles
    applyElementStyles(joy, setup.joystick, 'left');
    applyElementStyles(kick, setup.kick, 'right');
    applyElementStyles(pass, setup.pass, 'right');

    // Configura eventos dos botões
    configureButtonEvents(kick, () => kickBall(true), () => kickBall(false));
    configureButtonEvents(pass, () => kickBall(true, true), () => kickBall(false));
}

/**
 * Manipula o movimento do joystick
 */
function handleStickMove(stickData) {
    stickAngle = (Math.abs(stickData.x) > 10 || Math.abs(stickData.y) > 10) 
        ? Math.atan2(-stickData.y, stickData.x) 
        : null;
}

/**
 * Aplica estilos a um elemento de controle
 */
function applyElementStyles(element, config, horizontalPosition) {
    const { opacity, marginX, marginY, size } = config;
    
    Object.assign(element.style, {
        opacity: `${opacity}%`,
        [horizontalPosition]: `${marginX}px`,
        bottom: `${marginY}px`,
        width: `${size}px`,
        height: `${size}px`,
        display: 'flex'
    });
}

/**
 * Configura eventos de toque para um botão
 */
function configureButtonEvents(button, startCallback, endCallback) {
    button.removeEventListener('touchstart', startCallback);
    button.removeEventListener('touchend', endCallback);
    button.addEventListener('touchstart', startCallback);
    button.addEventListener('touchend', endCallback);
}

/**
 * Atualiza a interface do usuário (HUD)
 */
function updateHUD() {
    ['scoreboard', 'lastMessage', 'buttons', 'ping'].forEach(key => {
        elements[key].style.opacity = setup.hud.opacity;
    });
}

/**
 * Sistema de gerenciamento de skins dos jogadores
 */
const skins = {
    cache: {},
    
    getNewSkin(skin) {
        const img = new Image();
        img.src = `../images/skins/${skin}`;
        
        return new Promise((resolve) => {
            img.onload = () => resolve(this.cache[skin] = img);
            img.onerror = () => {
                img.src = '../images/skins/0.png';
                img.onload = () => resolve(this.cache[skin] = img);
            };
        });
    },

    getPlayerSkin(skin) {
        if (this.cache[skin]) return this.cache[skin];
    
        const fallback = new Image();
        fallback.src = '../images/skins/0.png';
        this.cache[skin] = fallback;
        this.getNewSkin(skin);
        return fallback;
    }    
};

/**
 * Desenha todos os elementos do jogo
 */
function drawGame() {
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

    drawField();
    drawGoals();
    drawPlayers();
    drawBall();
    drawNicks();

    if (socketId in players) updateCamera(players[socketId], ball);
}

/**
 * Desenha o campo de jogo
 */
function drawField() {
    // Fundo do gramado
    ctx.fillStyle = '#4F6F52';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const width = 1400, height = 750;
    const rectX = (canvas.width - width) / 2, rectY = (canvas.height - height) / 2;

    // Linhas do campo
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(rectX, rectY, width, height);

    // Linha central
    const centerX = rectX + width / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, rectY);
    ctx.lineTo(centerX, rectY + height);
    ctx.stroke();

    // Círculo central
    const centerY = rectY + height / 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, height / 6, 0, 2 * Math.PI);
    ctx.stroke();
}

/**
 * Desenha os jogadores
 */
function drawPlayers() {
    for (let id in players) {
        const player = players[id];
        if (!player.team) continue;

        // Área de influência
        if (player.id === socketId) {
            drawCircle(
                player.x, player.y, 
                player.radius + player.range, 
                id === socketId && isKicking ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.05)'
            );
        }
        
        // Cor base
        drawCircle(
            player.x, player.y, 
            player.radius - 2, 
            TEAM_COLORS[player.team][0], 
            TEAM_COLORS[player.team][0]
        );

        // Skin
        const skin = skins.getPlayerSkin(player.skin);
        if (skin) {
            const size = (player.radius * 2) - 6;
            ctx.drawImage(skin, player.x - size / 2, player.y - size / 2, size, size);
        }
    }
}

/**
 * Desenha a bola
 */
function drawBall() {
    ctx.save();
    ctx.translate(ball.x, ball.y);
    drawCircle(0, 0, ball.radius - 2, '#FFFFFF', '#000000');
    ctx.restore();
}

/**
 * Desenha os gols
 */
function drawGoals() {
    const goals = { x: [400, 1800], y: [675, 875], depth: 50 };

    for (let i = 0; i < goals.x.length; i++) {
        for (let j = 0; j < goals.y.length; j++) {
            let lineX = goals.x[i] + (goals.x[i] === goals.x[0] ? -goals.depth : goals.depth);

            ctx.beginPath();
            ctx.moveTo(goals.x[i], goals.y[j]);
            ctx.lineTo(lineX, goals.y[j]);
            ctx.strokeStyle = '#000';
            ctx.stroke();
            
            if (j > 0) {
                ctx.beginPath();
                ctx.moveTo(lineX, goals.y[j-1]);
                ctx.lineTo(lineX, goals.y[j]);
                ctx.stroke();
            }
    
            drawCircle(
                goals.x[i], goals.y[j], 
                5.5, 
                (goals.x[i] > elements.canvas.width / 2 ? TEAM_COLORS.away[0] : TEAM_COLORS.home[0]), 
                '#000'
            );
        }
    }
}

/**
 * Desenha os apelidos dos jogadores
 */
function drawNicks() {
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';

    Object.values(players).forEach((player) => {
        if (!player.team || player.id === socketId) return;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(player.nickname, player.x, player.y + player.radius + 16);
    });
}

/**
 * Desenha um círculo
 */
function drawCircle(x, y, radius, fillColor, strokeColor = null) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
    }
    if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }
}

let cachedCameraWidth = 0, cachedCameraHeight = 0, lastZoomLevel = 0;

/**
 * Atualiza a posição da câmera
 */
function updateCamera(player, ball) {
    const camWidth = elements.camera.clientWidth;
    const camHeight = elements.camera.clientHeight;
    const zoom = setup.zoom.level;
    const halfCamWidth = (camWidth / 2) / zoom;
    const halfCamHeight = (camHeight / 2) / zoom;

    const { x: px, y: py } = player;
    const { x: bx, y: by } = ball;

    // Calcula o ponto alvo
    let targetX, targetY;
    if (player.team) {
        const distanceThresholdX = camWidth / zoom;
        const distanceThresholdY = camHeight / zoom;
        
        targetX = (Math.abs(px - bx) > distanceThresholdX) 
            ? px - halfCamWidth 
            : ((px + bx) / 2) - halfCamWidth;
            
        targetY = (Math.abs(py - by) > distanceThresholdY) 
            ? py - halfCamHeight 
            : ((py + by) / 2) - halfCamHeight;
    } else {
        targetX = bx - halfCamWidth;
        targetY = by - halfCamHeight;
    }

    // Suavização
    const lerpFactor = 0.1;
    cameraX = lerp(cameraX, targetX, lerpFactor);
    cameraY = lerp(cameraY, targetY, lerpFactor);

    // Limites
    const maxCameraX = elements.canvas.width - (camWidth / zoom);
    const maxCameraY = elements.canvas.height - (camHeight / zoom);
    const clampedX = clamp(cameraX, 0, maxCameraX);
    const clampedY = clamp(cameraY, 0, maxCameraY);

    // Aplica transformação
    elements.canvas.style.transform = `
        translate(${-clampedX * zoom}px, ${-clampedY * zoom}px)
        scale(${zoom})
    `;
    elements.canvas.style.transformOrigin = "0 0";
}

function lerp(start, end, t) {
    return start + (end - start) * t;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function setZoom(level) {
    setup.zoom.level = clamp(level, 0.7, 1.5);
}

/**
 * Cria um card de jogador para a lista
 */
const createPlayerCard = (player) => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.textContent = player.nickname;
    card.title = player.nickname;

    if (room.leader === player.id) card.style.color = "yellow";

    card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedPlayerId === player.id) {
            selectedPlayerId = null;
            card.classList.remove('selected');
        } else {
            document.querySelector('.player-card.selected')?.classList.remove('selected');
            card.classList.add('selected');
            selectedPlayerId = player.id;
        }
    });

    return card;
};

/**
 * Preenche uma lista com cards de jogadores
 */
const fillList = (listElement, players) => {
    if (!listElement || !players || players.length === 0) {
        if (listElement) listElement.innerHTML = '';
        return;
    }

    listElement.innerHTML = '';
    players.forEach(player => {
        listElement.appendChild(createPlayerCard(player));
    });
};

/**
 * Atualiza a lista de jogadores na interface
 */
function listPlayers() {
    const groupedPlayers = { homePlayers: [], awayPlayers: [], spectators: [] };

    Object.values(players).forEach(player => {
        if (player.team === 'home') groupedPlayers.homePlayers.push(player);
        else if (player.team === 'away') groupedPlayers.awayPlayers.push(player);
        else groupedPlayers.spectators.push(player);
    });

    fillList(elements.homeList, groupedPlayers.homePlayers);
    fillList(elements.awayList, groupedPlayers.awayPlayers);
    fillList(elements.spectatorList, groupedPlayers.spectators);
    elements.refereeActionButtons.style.display = room.leader === socketId ? 'flex' : 'none';
}

/**
 * Configura um elemento para esconder um div quando clicado fora
 */
function setupHideOnClick(element, targetDiv, callback) {
    element.addEventListener('click', () => {
        targetDiv.addEventListener('click', (event) => {
            if (event.target === targetDiv) targetDiv.style.display = "none";
        });
        targetDiv.style.display = 'flex';
        if (callback) callback();
    });
}

/**
 * Inicializa os controles de range (sliders)
 */
function initializeRangeInputs(category) {
    for (const [property, element] of Object.entries(elements.range[category])) {
        if (!element || setup[category][property] === undefined) continue;
        
        element.value = setup[category][property];
        element.addEventListener('input', () => {
            setup[category][property] = Number(element.value);
            localStorage.setItem('setup', JSON.stringify(setup));
            
            if (['joystick', 'kick', 'pass'].includes(category)) {
                updateController();
            } else if (category === 'hud') {
                updateHUD();
            }
        });
    }
}

function isInputFocused() {
    return elements.inputMessage === document.activeElement;
}

const keyActions = {
    'escape': () => {
        [elements.refereeDiv, elements.settingsDiv, elements.chatDiv].forEach(div => {
            if (div.style.display === 'flex') div.style.display = 'none';
        });
    },
    'enter': () => {
        if (isInputFocused()) {
            sendMessage();
            setTimeout(() => elements.inputMessage.focus(), 0);
        } else {
            keysPressed = {};
            elements.lastMessage.click();
            elements.inputMessage.focus();
        }
    },
    't': () => {
        keysPressed = {};
        elements.lastMessage.click();
        elements.inputMessage.focus();
    },
    'r': () => elements.refereeButton.click(),
    'f': () => elements.fullscreenButton.click(),
    ' ': () => kickBall(false),
    'shift': () => kickBall(false),
    '0': () => kickBall(false),
    'x': () => kickBall(false),
    'c': () => kickBall(false),
    'm': () => kickBall(false),
    'q': () => kickBall(false),
    '[': () => roomLeader('restart'),
    ']': () => roomLeader('pause'),
};

document.addEventListener('keydown', function(event) {
    const key = event.key.toLowerCase();
    if (isInputFocused()) return;

    if (key === ' ' || key === 'shift' || key === '0') {
        kickBall(true);
    } else if (key === 'x' || key === 'm' || key === 'q') {
        kickBall(true, true);
    } else {
        keysPressed[key] = true;
    }
});

document.addEventListener('keyup', function(event) {
    const key = event.key.toLowerCase();

    if (key === 'escape') {
        keyActions['escape']();
        return;
    }

    if (isInputFocused()) {
        if (key === 'enter') sendMessage();
        return;
    }

    keyActions[key]?.();
    if (key !== ' ' && key !== 'x') delete keysPressed[key];
});

/**
 * Ativa/desativa o estado de chute
 */
function kickBall(state, pass = false) {
    kickPressed = state;
    isKicking = state;
    passBall = pass;
}

/**
 * Movimenta o jogador local
 */
function movePlayer() {
    const angle = calculateAngle();

    if (angle !== currentAngle) {
        currentAngle = angle;
        socket.emit('move', currentAngle);
    }
    
    // Verifica chute
    if (kickPressed) {
        const player = players[socketId];
        const detectionRange = player.radius + ball.radius + player.range;

        if (player.team && distanceBetween(player.x, player.y, ball.x, ball.y) <= detectionRange) {
            socket.emit('kick', passBall);
            kickPressed = false;
            passBall = false;
        }
    }

    requestAnimationFrame(movePlayer);
}

/**
 * Calcula a distância entre dois pontos
 */
function distanceBetween(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calcula o ângulo de movimento
 */
function calculateAngle() {
    if (setup.active && stickAngle !== null) return stickAngle;

    // Combinações de teclas
    if ((keysPressed['w'] || keysPressed['arrowup']) && (keysPressed['a'] || keysPressed['arrowleft'])) return 5 * Math.PI / 4;
    if ((keysPressed['w'] || keysPressed['arrowup']) && (keysPressed['d'] || keysPressed['arrowright'])) return -Math.PI / 4;
    if ((keysPressed['s'] || keysPressed['arrowdown']) && (keysPressed['a'] || keysPressed['arrowleft'])) return 3 * Math.PI / 4;
    if ((keysPressed['s'] || keysPressed['arrowdown']) && (keysPressed['d'] || keysPressed['arrowright'])) return Math.PI / 4;

    // Movimento reto
    if (keysPressed['w'] || keysPressed['arrowup']) return -Math.PI / 2;
    if (keysPressed['a'] || keysPressed['arrowleft']) return Math.PI;
    if (keysPressed['s'] || keysPressed['arrowdown']) return Math.PI / 2;
    if (keysPressed['d'] || keysPressed['arrowright']) return 0;

    return null;
}

/**
 * Envia comando do líder da sala
 */
function roomLeader(command, target = null, modifier = null) {
    if (room.leader !== socketId) return;
    socket.emit('leader', {command, target, modifier});
}

/**
 * Envia mensagem de chat
 */
function sendMessage() {
    const messageText = elements.inputMessage.value.trim();
    if (messageText === "") return;

    socket.emit('chat', { 
        type: 'message', 
        body: { text: messageText, timestamp: Date.now() }
    });
    elements.inputMessage.value = '';
    elements.inputMessage.blur();
}

/**
 * Formata o tempo de jogo
 */
function formatTimer(elapsed) {
    elapsed *= 1000 / 60;
    const minutes = Math.floor((elapsed / 1000) / 60);
    const seconds = Math.floor((elapsed / 1000) % 60);
    return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/**
 * Toca um efeito sonoro
 */
function playSound(sound) {
    sound.currentTime = 0;
    sound.play();
}

// Ping regular para medir latência
setInterval(() => {
    const start = Date.now();
    socket.emit('ping', () => {
        const duration = Math.min(Date.now() - start, 999);
        elements.ping.textContent = `OpenFZ | Ping: ${duration}ms`;
    });
}, 3000);

// Conexão estabelecida
socket.on('connect', () => {
    const metadata = JSON.parse(sessionStorage.getItem("metadata"));
    if (!metadata) {
        window.location.href = "/";
        return;
    }

    setTimeout(() => {
        socket.emit('joinRoom', metadata);
        socketId = socket.id;
        elements.overlay.remove();
        updateController();        
        updateHUD();
        movePlayer();

        // Aplica cores dos times
        Object.entries(TEAM_COLORS).forEach(([team, color]) => {
            document.getElementById(`${team}Colors`).style.color = color[0];
            document.getElementById(`${team}ListContainer`).style.background = color[0];
        });
    }, 1500);
});

// Atualização do estado do jogo
socket.on('update', (data) => {
    room = data.room;
    players = data.players;
    ball = data.ball;
    score = data.score;
    
    elements.score.textContent = `${score.home} - ${score.away}`;
    elements.timer.textContent = formatTimer(score.elapsed);

    drawGame();
});

// Mudança de time
socket.on('playerTeamChanged', listPlayers);

// Mensagem de chat
socket.on('chat', (data) => {
    const { entity, content } = data;
    const message = document.createElement('p');
    message.style.color = content.type === 'connection' ? 'yellow' : '#E0E0E0';
    
    const nickname = document.createElement('span');
    nickname.textContent = entity.nickname;
    nickname.style.fontWeight = 600;
    
    const timeString = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const timestamp = document.createElement('span');
    timestamp.textContent = '[' + timeString + '] ';

    if (content.type === 'connection') {
        message.appendChild(nickname);
        message.appendChild(document.createTextNode(`${content.connected ? ' has joined' : ' has left'}`));
    } else if (content.type === 'message') {
        nickname.style.color = entity.team ? TEAM_COLORS[entity.team][0] : '#E0E0E0';
        message.appendChild(timestamp);
        message.appendChild(nickname);
        message.appendChild(document.createTextNode(' ' + content.body.text));
    }
    
    elements.chat.appendChild(message);
    elements.chat.scrollTop = elements.chat.scrollHeight;
    elements.lastMessage.textContent = '';
    elements.lastMessage.appendChild(message.cloneNode(true));
});

// Gol marcado
socket.on('goal', (data) => {
    const { team, scorer, assister } = data;
    
    elements.goal.style.color = TEAM_COLORS[team][0];
    elements.goal.style.textShadow = `3px 3px 0px ${TEAM_COLORS[team][1]}`;
    elements.goalOverlay.style.display = 'flex';

    elements.author.textContent = scorer 
      ? `${scorer.nickname} ${team === scorer.team && assister && scorer.team === assister.team && scorer.id !== assister.id 
          ? `(${assister.nickname})` 
          : team !== scorer.team ? '(o.g.)' : ''}` 
      : 'Unknown scorer';
    
    setTimeout(() => {
        elements.goalOverlay.style.display = 'none';
    }, 1000);
});

// Efeito sonoro
socket.on('playSound', (data) => {
    const sound = data.soundType === "kick" ? elements.kickSound : elements.postSound;
    playSound(sound);
});

// Configura elementos de UI
setupHideOnClick(elements.refereeButton, elements.refereeDiv, listPlayers);
setupHideOnClick(elements.settingsButton, elements.settingsDiv);
setupHideOnClick(elements.lastMessage, elements.chatDiv);

// Inicializa controles de range
for (const category in elements.range) {
    if (setup[category]) initializeRangeInputs(category);
}

// Configura botões de time
const teamButtons = {
    homeListContainer: "home",
    spectatorButton: null,
    awayListContainer: "away"
};

Object.entries(teamButtons).forEach(([buttonId, team]) => {
    elements[buttonId]?.addEventListener('click', (e) => roomLeader('setTeam', selectedPlayerId, team));
});

// Configura outros botões
elements.fullscreenButton?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

elements.exitButton?.addEventListener('click', () => {
    window.location.href = "/";
});

['pause', 'restart'].forEach(command => {
    elements[command]?.addEventListener('click', () => roomLeader(command));
});

// Resize handler
window.addEventListener('resize', () => {
    screen = { width: window.innerWidth, height: window.innerHeight };
});
// Importa os módulos necessários
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const compression = require('compression');

// --- Configurações Globais e Constantes ---

const TICK_RATE = 60; // Taxa de atualização do loop do jogo (em Hz)
const PORT = process.env.PORT || 3000; // Porta do servidor

// Configurações do campo de jogo
const pitch = {
    width: 1400,
    height: 750,
    marginX: 400,
    marginY: 400,
    goalSide: 100,
    get goalTopY() { return (this.height / 2) + this.marginY - this.goalSide; },
    get goalBottomY() { return (this.height / 2) + this.marginY + this.goalSide; },
    get center_x() { return (this.width / 2) + this.marginX; },
    get center_y() { return (this.height / 2) + this.marginY; },
};

// Configurações das traves
const goals = {
    position: [
        { x: pitch.marginX, y: pitch.goalTopY },
        { x: pitch.marginX, y: pitch.goalBottomY },
        { x: pitch.width + pitch.marginX, y: pitch.goalTopY },
        { x: pitch.width + pitch.marginX, y: pitch.goalBottomY }
    ],
    radius: 7.5
};

// Posições iniciais dos jogadores
const alignment = {
    home: [
        { x: 500, y: 775 }, 
        { x: 600, y: 650 }, 
        { x: 600, y: 900 }, 
        { x: 700, y: 775 }
    ],
    away: [
        { x: 1600, y: 775 }, 
        { x: 1500, y: 650 }, 
        { x: 1500, y: 900 }, 
        { x: 1400, y: 775 }
    ]
};

// --- Classes ---

/**
 * Classe utilitária para cálculos de física.
 */
class PhysicsUtils {
    /**
     * Calcula a distância entre dois pontos.
     */
    static distanceBetween(x1, y1, x2, y2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Verifica se dois círculos estão colidindo.
     */
    static isCollidingCircle(x1, y1, radius1, x2, y2, radius2) {
        if (x1 === null || y1 === null || x2 === null || y2 === null) return false;
        const distance = PhysicsUtils.distanceBetween(x1, y1, x2, y2);
        return distance < radius1 + radius2;
    }

    /**
     * Calcula o vetor de deslocamento para resolver a colisão entre dois círculos.
     */
    static resolveCollision(x1, y1, radius1, x2, y2, radius2, mass1, mass2) {
        const distance = PhysicsUtils.distanceBetween(x1, y1, x2, y2);

        if (distance < radius1 + radius2) {
            const overlap = radius1 + radius2 - distance;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const force = (mass1 + mass2) / 2;
            return {
                x: Math.cos(angle) * overlap * force * 0.1,
                y: Math.sin(angle) * overlap * force * 0.1
            };
        }
        return { x: 0, y: 0 };
    }
}

/**
 * Representa a bola do jogo.
 */
class Ball {
    constructor() {
        this.radius = 10;
        this.mass = 5;
        this.friction = 0.982;
        this.acceleration = 0.3; // Influencia força do chute/colisão
        this.reset();
    }

    /**
     * Reseta a bola para a posição e estado inicial.
     */
    reset() {
        this.x = pitch.center_x;
        this.y = pitch.center_y;
        this.velocityX = 0;
        this.velocityY = 0;
        this.angle = 0; // Rotação visual
        this.active = true; // Se está em jogo
        this.scorer = null;
        this.assister = null;
    }

    /**
     * Atualiza a física da bola (movimento, atrito, colisões com bordas/gols).
     * @param {Room} room - A sala onde a bola está.
     */
    update(room) {
        // Movimento e Atrito
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.velocityX *= this.friction;
        this.velocityY *= this.friction;

        // Parar totalmente quando a velocidade estiver muito baixa
        if (Math.abs(this.velocityX) < 0.05) this.velocityX = 0;
        if (Math.abs(this.velocityY) < 0.05) this.velocityY = 0;

        // Rotação Visual
        const speed = Math.sqrt(this.velocityX ** 2 + this.velocityY ** 2);
        if (speed > 0.1) {
            this.angle += speed / this.radius * (this.velocityX >= 0 ? 1 : -1) * 0.1;
        }

        // Colisões com Bordas e Gols
        this._handleBoundaryCollisions(room);
    }

    _handleBoundaryCollisions(room) {
      const rightBoundary = pitch.width + pitch.marginX;
      const leftBoundary = pitch.marginX;
      const bottomBoundary = pitch.height + pitch.marginY;
      const topBoundary = pitch.marginY;
      const goalNetDepth = 50; // Profundidade da rede
      const goalTopY = (pitch.height / 2) + pitch.marginY - pitch.goalSide;
      const goalBottomY = (pitch.height / 2) + pitch.marginY + pitch.goalSide;
  
      // Borda Direita e Gol 'Home'
      if (this.x + this.radius > rightBoundary) {
          // Verifica se está na altura do gol
          if (this.y - this.radius > goalTopY - 10 && this.y + this.radius < goalBottomY + 10) {
              // Colisão com o poste/trave superior
              if (this.y - this.radius < goalTopY) {
                  this.y = goalTopY + this.radius;
                  this.velocityY = -this.velocityY * 0.3;
              }
              // Colisão com o poste/trave inferior
              if (this.y + this.radius > goalBottomY) {
                  this.y = goalBottomY - this.radius;
                  this.velocityY = -this.velocityY * 0.3;
              }
              // Colisão com o fundo da rede
              if (this.x + this.radius > rightBoundary + goalNetDepth) {
                  this.x = rightBoundary + goalNetDepth - this.radius;
                  this.velocityX = -this.velocityX * 0.3;
              }
              // Condição de gol - bola inteira cruzou a linha
              if (this.x - this.radius > rightBoundary) {
                  room.handleGoal('home');
              }
          } else { // Colisão com parede lateral fora do gol
              this.x = rightBoundary - this.radius;
              this.velocityX *= -0.5;
          }
      }
  
      // Borda Esquerda e Gol 'Away'
      if (this.x - this.radius < leftBoundary) {
          // Verifica se está na altura do gol
          if (this.y - this.radius > goalTopY - 10 && this.y + this.radius < goalBottomY + 10) {
              // Colisão com o poste/trave superior
              if (this.y - this.radius < goalTopY) {
                  this.y = goalTopY + this.radius;
                  this.velocityY = -this.velocityY * 0.3;
              }
              // Colisão com o poste/trave inferior
              if (this.y + this.radius > goalBottomY) {
                  this.y = goalBottomY - this.radius;
                  this.velocityY = -this.velocityY * 0.3;
              }
              // Colisão com o fundo da rede
              if (this.x - this.radius < leftBoundary - goalNetDepth) {
                  this.x = leftBoundary - goalNetDepth + this.radius;
                  this.velocityX = -this.velocityX * 0.3;
              }
              // Condição de gol - bola inteira cruzou a linha
              if (this.x + this.radius < leftBoundary) {
                  room.handleGoal('away');
              }
          } else { // Colisão com parede lateral fora do gol
              this.x = leftBoundary + this.radius;
              this.velocityX *= -0.5;
          }
      }
  
      // Borda Inferior
      if (this.y + this.radius > bottomBoundary) {
          this.y = bottomBoundary - this.radius;
          this.velocityY *= -0.5;
      }
  
      // Borda Superior
      if (this.y - this.radius < topBoundary) {
          this.y = topBoundary + this.radius;
          this.velocityY *= -0.5;
      }
    }

    /**
     * Aplica uma força de chute na bola.
     * @param {number} angle - O ângulo do chute.
     * @param {number} force - A força do chute.
     * @param {Player} kicker - O jogador que chutou.
     */
    applyKick(angle, force, kicker) {
        this.velocityX += Math.cos(angle) * force;
        this.velocityY += Math.sin(angle) * force;

        // Atualiza marcador/assistente
        if (!this.scorer || this.scorer.id !== kicker.id) {
            this.assister = this.scorer;
            this.scorer = { id: kicker.id, nickname: kicker.nickname, team: kicker.team };
        } else {
            this.assister = null; // Mesmo jogador chutou de novo
        }
    }
}

/**
 * Representa um jogador conectado.
 */
class Player {
    constructor(id, nickname, skin) {
        this.id = id;
        this.nickname = nickname.slice(0, 24) || 'Guest_' + id.slice(0, 4);
        this.skin = skin || '0.png';
        this.radius = 20;
        this.mass = 10;
        this.range = 10; // Alcance do chute
        this.speed = 2.6;
        this.angle = null; // Ângulo de movimento (null = parado)
        this.x = null; // Posição X (null se espectador)
        this.y = null; // Posição Y (null se espectador)
        this.team = null; // 'home', 'away' ou null (espectador)
        this.lastKickTime = 0; // Para cooldown do chute
    }

    /**
     * Atualiza a posição do jogador com base no ângulo de movimento.
     */
    updatePosition() {
        if (this.angle !== null && this.x !== null && this.y !== null) {
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;
        }

        this.x = Math.max(this.radius, Math.min(pitch.width + (pitch.marginX * 2) - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(pitch.height + (pitch.marginY * 2) - this.radius, this.y));
    }

    /**
     * Define o time e a posição inicial do jogador.
     * @param {'home' | 'away' | null} team - O time para definir.
     * @param {number} positionIndex - O índice da posição no array de alinhamento.
     */
    setTeam(team, positionIndex) {
        this.team = team;
        if (team && alignment[team] && alignment[team][positionIndex]) {
            this.x = alignment[team][positionIndex].x;
            this.y = alignment[team][positionIndex].y;
            this.angle = null; // Para de se mover ao trocar de time
        } else { // Espectador ou posição inválida
            this.x = null;
            this.y = null;
            this.angle = null;
            if (team) { // Fallback se a posição não existir
                this.x = pitch.center_x + (team === 'home' ? -50 : 50);
                this.y = pitch.center_y;
            }
        }
    }

    /**
     * Tenta chutar a bola.
     * @param {Ball} ball - O objeto da bola.
     * @param {boolean} isPass - Se o chute é um passe (mais fraco).
     * @returns {boolean} True se o chute foi bem-sucedido, false caso contrário.
     */
    kick(ball, isPass) {
        if (!this.team) return false; // Não pode chutar se for espectador

        const now = Date.now();
        if (now - this.lastKickTime < 100) return false; // Cooldown de 100ms
            

        const distanceToBall = PhysicsUtils.distanceBetween(this.x, this.y, ball.x, ball.y);
        const detectionRange = this.radius + ball.radius + this.range;

        if (distanceToBall <= detectionRange) {
            this.lastKickTime = now;
            const angle = Math.atan2(ball.y - this.y, ball.x - this.x);
            const kickForce = isPass ? 6.5 : 8.5;
            ball.applyKick(angle, kickForce, this);
            return true; // Chute bem-sucedido
        }
        return false; // Bola fora de alcance
    }

    /**
     * Retorna uma representação serializável do jogador (para estado e chat).
     * IMPORTANTE: Deve corresponder ao que o cliente espera no evento 'chat' original.
     */
    serializeForChat() {
        // Retorna todas as propriedades esperadas pelo formato original
        return {
            id: this.id,
            nickname: this.nickname,
            skin: this.skin,
            radius: this.radius,
            mass: this.mass,
            range: this.range,
            angle: this.angle,
            x: this.x,
            y: this.y,
            team: this.team,
            lastKickTime: this.lastKickTime
        };
    }

    /**
     * Retorna uma representação serializável do jogador para o estado do jogo ('update').
     * Pode ser um subconjunto de `serializeForChat` para otimizar.
     */
    serializeForState() {
        return {
            id: this.id, nickname: this.nickname, skin: this.skin,
            radius: this.radius,
            range: this.range,
            x: this.x, y: this.y, team: this.team, angle: this.angle
        };
    }
}

/**
 * Representa uma sala de jogo.
 */
class Room {
    constructor(id, name, password, leaderId, io) {
        this.id = id;
        this.name = name;
        this.password = password || null;
        this.leaderId = leaderId;
        this.io = io; // Referência ao servidor Socket.IO para emitir eventos

        this.players = {}; // Armazena instâncias da classe Player
        this.ball = new Ball();
        this.score = { home: 0, away: 0, elapsed: 0 };
        this.paused = false;
        this.gameLoopInterval = null; // Referência ao intervalo do loop
        this.timestamp = Date.now();
    }

    /**
     * Adiciona um jogador à sala.
     * @param {Socket} socket - O socket do jogador.
     * @param {string} nickname - O nickname do jogador.
     * @param {string} skin - A skin do jogador.
     * @returns {Player} A instância do jogador criada.
     */
    addPlayer(socket, nickname, skin) {
        const player = new Player(socket.id, nickname, skin);
        this.players[socket.id] = player;
        socket.join(this.id); // Adiciona o socket à sala do Socket.IO

        this.broadcast('chat', {
            entity: player.serializeForChat(),
            content: { type: 'connection', connected: true } // Apenas tipo e estado
        });
        
        // Inicia o loop do jogo se ainda não estiver rodando e houver jogadores
        if (!this.gameLoopInterval && Object.keys(this.players).length > 0) {
            this.startGameLoop();
        } else {
            this.updateRoomState(); // Envia atualização para todos se o jogo já começou
        }
        return player;
    }

    /**
     * Remove um jogador da sala.
     * @param {string} playerId - O ID do jogador a ser removido.
     */
    removePlayer(playerId) {
        const player = this.players[playerId];
        if (!player) return;

        // Guarda os dados ANTES de deletar
        const playerChatData = player.serializeForChat();

        delete this.players[playerId];

        // Envia mensagem de desconexão no formato original
        this.broadcast('chat', {
            entity: playerChatData, // Usa os dados guardados do jogador que saiu
            content: { type: 'connection', connected: false } // Apenas tipo e estado
        });

        // Verifica se a sala ficou vazia
        if (this.isEmpty()) {
            this.stopGameLoop();
            // A remoção da sala do servidor é feita na classe GameServer
        } else {
            // Se o líder saiu, elege um novo
            if (playerId === this.leaderId) this.electNewLeader();
            this.updateRoomState(); // Atualiza o estado para os jogadores restantes
        }
    }

    /** Verifica se a sala está vazia. */
    isEmpty() {
        return Object.keys(this.players).length === 0;
    }

    /** Elege um novo líder se o atual sair. */
    electNewLeader() {
        this.leaderId = Object.keys(this.players)[0]; // Pega o primeiro jogador restante
        this.broadcast('newLeader', { leaderId: this.leaderId });
    }

    /**
     * Inicia o loop principal do jogo.
     */
    startGameLoop() {
        if (this.gameLoopInterval) return; // Já está rodando

        this.paused = false; // Garante que não está pausado
        this.gameLoopInterval = setInterval(() => {
            if (!this.paused) {
                this.tick();
            }
        }, 1000 / TICK_RATE);
    }

    /**
     * Para o loop principal do jogo.
     */
    stopGameLoop() {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }
    }

    /**
     * Executa um tick (quadro) do jogo.
     */
    tick() {
        this.updatePhysics();
        this.updatePlayersPosition();
        this.updateRoomState();
    }

    /**
     * Atualiza a física da sala (bola, colisões).
     */
    updatePhysics() {
        // 1. Atualiza a bola (movimento, colisões com bordas/gols)
        this.ball.update(this);

        // 2. Colisões com as traves
        this._handleGoalPostCollisions();

        // 3. Colisões Jogador <-> Jogador e Jogador <-> Bola
        this._handleEntityCollisions();
    }

    /** Trata colisões com as traves. @private */
    _handleGoalPostCollisions() {
        goals.position.forEach((post) => {
            // Jogador <-> Trave
            Object.values(this.players).forEach(player => {
                if (PhysicsUtils.isCollidingCircle(player.x, player.y, player.radius, post.x, post.y, goals.radius)) {
                    const angle = Math.atan2(player.y - post.y, player.x - post.x);
                    player.x = post.x + Math.cos(angle) * (goals.radius + player.radius);
                    player.y = post.y + Math.sin(angle) * (goals.radius + player.radius);
                }
            });

            // Bola <-> Trave
            if (PhysicsUtils.isCollidingCircle(this.ball.x, this.ball.y, this.ball.radius, post.x, post.y, goals.radius)) {
                const angle = Math.atan2(this.ball.y - post.y, this.ball.x - post.x);
                // Afasta a bola
                this.ball.x = post.x + Math.cos(angle) * (goals.radius + this.ball.radius);
                this.ball.y = post.y + Math.sin(angle) * (goals.radius + this.ball.radius);
                // Reflete velocidade
                const normalX = Math.cos(angle);
                const normalY = Math.sin(angle);
                const dotProduct = this.ball.velocityX * normalX + this.ball.velocityY * normalY;
                this.ball.velocityX -= 2 * dotProduct * normalX;
                this.ball.velocityY -= 2 * dotProduct * normalY;
                // Perda de energia
                this.ball.velocityX *= 0.5;
                this.ball.velocityY *= 0.5;
                // Som
                this.broadcast('playSound', { soundType: 'post' });
            }
        });
    }

    /** Trata colisões entre jogadores e entre jogador/bola. @private */
    _handleEntityCollisions() {
        const playerList = Object.values(this.players);

        for (let i = 0; i < playerList.length; i++) {
            const p1 = playerList[i];
            if (!p1.x) continue; // Ignora espectador

            // Colisão Jogador <-> Jogador
            for (let j = i + 1; j < playerList.length; j++) {
                const p2 = playerList[j];
                if (!p2.x) continue; // Ignora espectador

                if (PhysicsUtils.isCollidingCircle(p1.x, p1.y, p1.radius, p2.x, p2.y, p2.radius)) {
                    const { x: pushX, y: pushY } = PhysicsUtils.resolveCollision(
                        p1.x, p1.y, p1.radius, p2.x, p2.y, p2.radius, p1.mass, p2.mass
                    );
                    p1.x -= pushX / 2; p1.y -= pushY / 2;
                    p2.x += pushX / 2; p2.y += pushY / 2;
                }
            }

            // Colisão Jogador <-> Bola
            if (PhysicsUtils.isCollidingCircle(p1.x, p1.y, p1.radius, this.ball.x, this.ball.y, this.ball.radius)) {
                const { x: pushX, y: pushY } = PhysicsUtils.resolveCollision(
                    p1.x, p1.y, p1.radius, this.ball.x, this.ball.y, this.ball.radius, p1.mass, this.ball.mass
                );
                // Afasta bola e jogador
                this.ball.x += pushX; this.ball.y += pushY;
                p1.x -= pushX / 4; p1.y -= pushY / 4; // Jogador sente menos impacto

                // Impulso na bola
                const angle = Math.atan2(pushY, pushX);
                this.ball.velocityX = (this.ball.velocityX + Math.cos(angle) * this.ball.acceleration * 1.65) * 0.95;
                this.ball.velocityY = (this.ball.velocityY + Math.sin(angle) * this.ball.acceleration * 1.65) * 0.95;

                // Atualiza último toque (potencial marcador/assistente)
                if (!this.ball.scorer || this.ball.scorer.id !== p1.id) {
                    this.ball.assister = this.ball.scorer;
                    this.ball.scorer = { id: p1.id, nickname: p1.nickname, team: p1.team };
                }
            }
        }
    }


    /**
     * Atualiza a posição de todos os jogadores na sala.
     */
    updatePlayersPosition() {
        Object.values(this.players).forEach(player => player.updatePosition());
    }

    /**
     * Envia o estado atualizado da sala para todos os clientes.
     */
    updateRoomState() {
        this.score.elapsed++;
        this.broadcast('update', this.getState());
    }

    /**
     * Retorna o estado atual da sala para ser enviado aos clientes.
     * Usa a serialização otimizada para o estado do jogo.
     * @returns {object} O objeto de estado da sala.
     */
    getState() {
        const playersData = {};
        for (const id in this.players) {
            // Usa a serialização específica para o estado
            playersData[id] = this.players[id].serializeForState();
        }

        return {
            room: {
                id: this.id, name: this.name, leader: this.leaderId, paused: this.paused
            },
            players: playersData,
            ball: { // Envia apenas dados relevantes da bola
                x: this.ball.x, y: this.ball.y, radius: this.ball.radius,
                velocityX: this.ball.velocityX, velocityY: this.ball.velocityY,
                angle: this.ball.angle,
                active: this.ball.active,
                scorer: this.ball.scorer,
                assister: this.ball.assister
            },
            score: this.score,
            timestamp: Date.now()
        };
    }

    /**
     * Trata o evento de gol.
     * @param {'home' | 'away'} scoringTeam - O time que marcou.
     */
    handleGoal(scoringTeam) {
        if (!this.ball.active) return; // Evita gols múltiplos

        this.ball.active = false;
        this.score[scoringTeam]++;

        this.broadcast('goal', {
            team: scoringTeam,
            scorer: this.ball.scorer,
            assister: this.ball.assister
        });

        // Agenda realinhamento
        setTimeout(() => {
            // Verifica se a sala ainda existe antes de tentar acessá-la
            // A referência `this` dentro do setTimeout ainda aponta para a instância da Room
            if (!gameServer.rooms[this.id]) return;

            // Verifica fim de jogo (ex: 5 gols)
            if (this.score.home === 5 || this.score.away === 5) {
                this.score.home = 0;
                this.score.away = 0;
                this.score.elapsed = 0;
            }

            this.realignment();
            this.ball.active = true;
            this.updateRoomState(); // Envia estado após realinhar
        }, 5000); // 5 segundos de espera
    }

    /**
     * Realinha jogadores e bola para o centro/posições iniciais.
     */
    realignment() {
        this.ball.reset(); // Reseta a bola

        let homeCount = 0;
        let awayCount = 0;

        Object.values(this.players).forEach(player => {
            if (player.team) {
                const teamCount = player.team === 'home' ? homeCount++ : awayCount++;
                player.setTeam(player.team, teamCount); // Reusa setTeam para definir posição
            } else {
                player.setTeam(null, 0); // Garante que espectador não tem posição
            }
        });
    }

    /**
     * Processa comandos enviados pelo líder da sala.
     * @param {string} command - O comando ('setTeam', 'pause', 'restart').
     * @param {string} targetId - O ID do jogador alvo (para 'setTeam').
     * @param {'home' | 'away' | null} modifier - O modificador (time para 'setTeam').
     * @param {Socket} leaderSocket - O socket do líder (para enviar erros).
     */
    handleLeaderCommand(command, targetId, modifier, leaderSocket) {
        switch (command) {
            case 'setTeam':
                const playerToSet = this.players[targetId];
                if (!playerToSet) return;

                const currentTeam = playerToSet.team;
                const targetTeam = modifier; // 'home', 'away', ou null

                if (targetTeam) { // Se está movendo para um time
                    const teamCount = Object.values(this.players).filter(p => p.team === targetTeam).length;

                    // Se o time não está cheio
                    if (teamCount >= 4 && currentTeam !== targetTeam) {
                        return;
                    }

                    // Usa teamCount como índice se estiver adicionando, ou encontra o índice atual se estiver trocando dentro do time
                    const positionIndex = currentTeam === targetTeam
                        ? alignment[targetTeam].findIndex(pos => pos.x === playerToSet.x && pos.y === playerToSet.y) // Tenta achar índice atual
                        : teamCount; // Usa contagem se for novo no time

                    playerToSet.setTeam(targetTeam, positionIndex === -1 ? teamCount : positionIndex); // Fallback para teamCount se não achar índice
                } else { // Mover para espectador
                    playerToSet.setTeam(null, 0);
                }
                // Notifica mudança e atualiza estado
                this.updateRoomState();
                this.broadcast('playerTeamChanged', { playerId: targetId, team: playerToSet.team, x: playerToSet.x, y: playerToSet.y });
                break;

            case 'pause':
                this.paused = !this.paused;
                // Se retomou e o loop não estava rodando (improvável, mas seguro), inicia
                if (!this.paused && !this.gameLoopInterval) this.startGameLoop();
                this.broadcast('pauseState', { paused: this.paused });
                break;

            case 'restart':
                this.score.home = 0;
                this.score.away = 0;
                this.score.elapsed = 0;
                this.realignment();
                this.paused = false;
                this.ball.active = true;
                this.broadcast('restartGame');
                this.updateRoomState();
                if (!this.gameLoopInterval) this.startGameLoop(); // Inicia se não estiver rodando
                break;
        }
    }

    /**
     * Transmite uma mensagem para todos os sockets na sala.
     * @param {string} event - O nome do evento Socket.IO.
     * @param {*} data - Os dados a serem enviados.
     */
    broadcast(event, data) {
        this.io.to(this.id).emit(event, data);
    }
}

/**
 * Gerencia o servidor Express, Socket.IO e as salas de jogo.
 */
class GameServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
        this.rooms = {}; // Armazena instâncias da classe Room

        this._setupMiddleware();
        this._setupRoutes();
        this._setupSocketIO();
    }

    /** Configura os middlewares do Express. @private */
    _setupMiddleware() {
        this.app.use(compression());
        this.app.use(express.static(path.join(__dirname, 'public')));
    }

    /** Configura as rotas HTTP. @private */
    _setupRoutes() {
        this.app.get('/rooms', (req, res) => {
            const roomList = Object.values(this.rooms).map(room => ({
                id: room.id,
                name: room.name,
                password: !!room.password, // True se tiver senha, false caso contrário
                count: Object.keys(room.players).length
            }));
            res.json(roomList);
        });
    }

    /** Configura os handlers de eventos do Socket.IO. @private */
    _setupSocketIO() {
        this.io.on('connection', (socket) => this._handleSocketConnection(socket));
    }

    /**
     * Lida com eventos de um socket recém-conectado.
     * @param {Socket} socket - O socket do cliente.
     * @private
     */
    _handleSocketConnection(socket) {
        let currentRoomId = null; // Mantém o ID da sala atual do socket

        // --- Evento: Entrar em uma Sala ('joinRoom') ---
        socket.on('joinRoom', (data) => {
            // Garante que o jogador não entre em outra sala sem desconectar da anterior (edge case)
            if (currentRoomId && this.rooms[currentRoomId]) {
                 this._handleSocketDisconnection(socket, currentRoomId, 'rejoin attempt');
                 currentRoomId = null;
            }

            const { nickname, skin, roomData } = data;
            if (!roomData || !roomData.id || !nickname) {
                socket.disconnect();
                return;
            }

            const roomId = roomData.id;
            let room = this.rooms[roomId];

            // Cria a sala se não existir
            if (!room) {
                room = new Room(roomId, roomData.name, roomData.password, socket.id, this.io);
                this.rooms[roomId] = room;
            }

            // Adiciona jogador à sala
            currentRoomId = roomId; // Associa o socket a esta sala
            const player = room.addPlayer(socket, nickname, skin); // Guarda a instância do jogador

            // --- Handlers de Eventos Específicos da Sala ---
            // Passa 'room' e 'player' para evitar problemas de escopo se a sala for deletada
            this._setupRoomEventHandlers(socket, room, player);
        });

        // Lida com erros gerais do socket
        socket.on('error', (err) => this._handleSocketDisconnection(socket, currentRoomId, 'error'));

        // --- Evento: Desconexão ('disconnect') ---
        socket.on('disconnect', (reason) => this._handleSocketDisconnection(socket, currentRoomId, reason));
    }

    /**
     * Configura os handlers de eventos do Socket.IO que dependem de uma sala.
     * @param {Socket} socket - O socket do cliente.
     * @param {Room} room - A sala à qual o socket pertence.
     * @param {Player} playerInstance - A instância do jogador associada ao socket.
     * @private
     */
    _setupRoomEventHandlers(socket, room, playerInstance) {
        const playerId = socket.id;

        // --- Evento: Comandos do Líder ('leader') ---
        socket.on('leader', (commandData) => {
            // Verifica se a sala ainda existe
            if (!this.rooms[room.id]) return;
            if (socket.id !== room.leaderId) return;

            const { command, target, modifier } = commandData;
            room.handleLeaderCommand(command, target, modifier, socket);
        });

        // --- Evento: Mensagem de Chat ('chat') ---
        socket.on('chat', (data) => {
            // Verifica se a sala ainda existe e o jogador está nela
            if (!this.rooms[room.id] || !room.players[playerId]) return;

            // Usa a instância do jogador passada para garantir que é o correto
            const player = playerInstance;

            if (data?.body?.text && player) {
                // Cria uma cópia do objeto 'data' original recebido do cliente
                const originalContent = { ...data };
                // Limita o texto dentro da cópia
                if (originalContent.body && originalContent.body.text.length > 128) {
                    originalContent.body.text = originalContent.body.text.slice(0, 128);
                }

                room.broadcast('chat', {
                    entity: player.serializeForChat(), // Envia o objeto jogador completo
                    content: originalContent          // Envia o objeto 'data' original (com texto limitado)
                });
            }
        });

        // --- Evento: Ping ('ping') ---
        socket.on("ping", (callback) => {
            // Verifica se a sala ainda existe
            if (!this.rooms[room.id]) return;
            if (typeof callback === 'function') callback();
        });

        // --- Evento: Movimento do Jogador ('move') ---
        socket.on('move', (angle) => {
            // Verifica se a sala ainda existe e o jogador está nela
             if (!this.rooms[room.id] || !room.players[playerId]) return;

            const player = playerInstance;
            if (player && player.team && player.x !== null) {
                if (typeof angle === 'number' || angle === null) {
                    player.angle = angle;
                } else {
                    player.angle = null;
                }
            }
        });

        // --- Evento: Chute ('kick') ---
        socket.on('kick', (isPass) => {
            // Verifica se a sala ainda existe e o jogador está nela
             if (!this.rooms[room.id] || !room.players[playerId]) return;

            const player = playerInstance;
            if (player && room.ball) {
                const kicked = player.kick(room.ball, isPass);
                if (kicked) {
                    // Emite som apenas se o chute foi bem-sucedido
                    room.broadcast('playSound', { soundType: 'kick' });
                }
            }
        });
    }

    /**
     * Lida com a desconexão de um socket.
     * @param {Socket} socket - O socket que desconectou.
     * @param {string | null} roomId - O ID da sala em que o socket estava.
     * @param {string} reason - A razão da desconexão.
     * @private
     */
    _handleSocketDisconnection(socket, roomId, reason) {
        if (roomId && this.rooms[roomId]) {
            const room = this.rooms[roomId];
            room.removePlayer(socket.id);

            // Remove a sala se ficou vazia
            if (room.isEmpty()) {
                // Garante que o loop parou antes de deletar
                room.stopGameLoop();
                delete this.rooms[roomId];
            }
        }
        // Remove todos os listeners específicos da sala para este socket para evitar memory leaks
        socket.removeAllListeners('leader');
        socket.removeAllListeners('chat');
        socket.removeAllListeners('ping');
        socket.removeAllListeners('move');
        socket.removeAllListeners('kick');
    }

    /**
     * Inicia o servidor HTTP para escutar conexões.
     */
    start() {
        this.server.listen(PORT, () => {
            console.log(`Servidor OpenFZ iniciado e rodando em http://127.0.0.1:${PORT}`);
        });
    }
}

// --- Inicialização ---
const gameServer = new GameServer();
gameServer.start();
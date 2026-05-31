import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Game State
let scene, camera, renderer, controls, mapGroup;
let prevTime = performance.now();
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false;

// Game Config
const BLOCK_SIZE = 2; // Size of one voxel block
const PLAYER_SPEED = 5; 
const MAP_SIZE = 40; // Increased map size for a larger maze

// Game Logic State
let gameMode = 'zombies'; // 'zombies', 'bots', 'multiplayer'
let maxHp = 100;
let hp = 100;
let round = 1;
let totalZombiesThisRound = Infinity; // Infinite mode based on time now
let zombiesKilled = 0;
let zombiesAlive = 0;
let enemies = []; // Unified array for zombies and bots
let companions = {}; // Multiplayer peers
let bullets = [];
let hasGun = true;
let currentWeapon = 'sniper'; // 'sword', 'sniper', 'shotgun', 'smg', 'flamethrower'
let isUpgrading = false;
let isGameStarted = false;
let isHost = false;
let mapGrid = [];
let fixedSpawnPos = null;
let lastZombieSpawnTime = 0;
let lastSyncTime = 0; // Throttle network sync
let enemyIdCounter = 0;

let sniperRangeBase = 10;
let rangeUpgradeCount = 0;

// PeerJS Networking
let peer = null;
let connections = [];

// Minimap
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

// Audio Context
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playShootSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    // "Boom" sound (low frequency punch)
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

function playHitSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    // "Kala Kala" sound (high frequency rapid rattle)
    osc.type = 'sawtooth';
    for (let i = 0; i < 3; i++) {
        const time = audioCtx.currentTime + i * 0.05;
        osc.frequency.setValueAtTime(800, time);
        osc.frequency.exponentialRampToValueAtTime(100, time + 0.04);
    }

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

// Particle System
let particles = [];

function createExplosion(pos) {
    for (let i = 0; i < 20; i++) {
        const size = 0.15 + Math.random() * 0.15;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({ color: 0xaa0000, roughness: 0.8 }); // Dark red blood chunks
        const p = new THREE.Mesh(geo, mat);
        
        p.position.copy(pos);
        p.position.x += (Math.random() - 0.5) * 0.5;
        p.position.y += (Math.random() - 0.5) * 1.5;
        p.position.z += (Math.random() - 0.5) * 0.5;
        
        scene.add(p);
        
        particles.push({
            mesh: p,
            vel: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 8 + 2, (Math.random() - 0.5) * 8),
            life: 1.5 + Math.random()
        });
    }
}

// Weapon Models
let weaponMesh;
const weaponGroup = new THREE.Group();

// UI Elements
const uiHp = document.getElementById('ui-hp');
const uiRound = document.getElementById('ui-round');
const uiZombies = document.getElementById('ui-zombies');
const uiWeapon = document.getElementById('ui-weapon');
const blocker = document.getElementById('blocker');
const upgradeModal = document.getElementById('upgrade-modal');
const uiContainer = document.getElementById('ui-container');

// Menus
const mainMenu = document.getElementById('main-menu');
const singleMenu = document.getElementById('single-menu');
const multiMenu = document.getElementById('multi-menu');
const lobbyMenu = document.getElementById('lobby-menu');
const lobbyHostView = document.getElementById('lobby-host-view');
const lobbyClientView = document.getElementById('lobby-client-view');
const ingamePeerId = document.getElementById('ingame-peer-id');

init();
animate();

function setupMenus() {
    document.getElementById('btn-singleplayer').onclick = () => {
        mainMenu.classList.add('hidden');
        singleMenu.classList.remove('hidden');
    };
    document.getElementById('btn-multiplayer').onclick = () => {
        mainMenu.classList.add('hidden');
        multiMenu.classList.remove('hidden');
        initPeer();
    };
    document.getElementById('btn-back-single').onclick = () => {
        singleMenu.classList.add('hidden');
        mainMenu.classList.remove('hidden');
    };
    document.getElementById('btn-back-multi').onclick = () => {
        multiMenu.classList.add('hidden');
        mainMenu.classList.remove('hidden');
    };

    document.getElementById('btn-mode-zombies').onclick = () => {
        startGame('zombies');
    };
    document.getElementById('btn-mode-bots').onclick = () => {
        startGame('bots');
    };

    // Multi
    document.getElementById('btn-start-host').onclick = () => {
        isHost = true;
        multiMenu.classList.add('hidden');
        lobbyMenu.classList.remove('hidden');
        lobbyHostView.classList.remove('hidden');
        lobbyClientView.classList.add('hidden');
        updateLobbyPlayers();
    };
    
    document.getElementById('btn-back-lobby-host').onclick = () => {
        isHost = false;
        lobbyMenu.classList.add('hidden');
        multiMenu.classList.remove('hidden');
        if (peer) {
            connections.forEach(conn => conn.close());
            connections = [];
        }
    };

    document.getElementById('btn-back-lobby-client').onclick = () => {
        lobbyMenu.classList.add('hidden');
        multiMenu.classList.remove('hidden');
        if (peer) {
            connections.forEach(conn => conn.close());
            connections = [];
        }
    };
    
    document.getElementById('btn-mode-multi-zombies').onclick = () => {
        startGame('multiplayer_zombies');
    };
    
    document.getElementById('btn-mode-multi-team').onclick = () => {
        startGame('multiplayer_team');
    };

    document.getElementById('btn-connect').onclick = () => {
        const friendId = document.getElementById('friend-id-input').value;
        if (friendId) {
            isHost = false;
            connectToPeer(friendId);
            // Don't start game yet, go to lobby
            multiMenu.classList.add('hidden');
            lobbyMenu.classList.remove('hidden');
            lobbyHostView.classList.add('hidden');
            lobbyClientView.classList.remove('hidden');
            document.getElementById('lobby-host-id').innerText = friendId;
        } else {
            alert('请输入同伴的服务器地址(联机码)');
        }
    };

    const btnEdit = document.getElementById('btn-edit-id');
    if (btnEdit) {
        btnEdit.onclick = () => {
            const current = document.getElementById('my-peer-id').innerText;
            const newId = prompt("请输入自定义联机码（纯数字或字母，建议简短）：", current);
            if (newId && newId.trim() !== '') {
                const formattedId = newId.trim().toUpperCase();
                localStorage.setItem('zombie_game_peer_id', formattedId);
                if (peer) {
                    peer.destroy();
                    peer = null;
                }
                document.getElementById('my-peer-id').innerText = "重新连接中...";
                initPeer();
            }
        };
    }
}

function updateLobbyPlayers() {
    const list = document.getElementById('lobby-players-list');
    list.innerHTML = '';
    
    // Add self
    const selfLi = document.createElement('li');
    selfLi.innerText = `[房主] ${peer ? peer.id : '我'}`;
    selfLi.style.color = '#55ff55';
    list.appendChild(selfLi);

    // Add connected peers
    connections.forEach(conn => {
        const li = document.createElement('li');
        li.innerText = `[同伴] ${conn.peer}`;
        list.appendChild(li);
    });
}

function startGame(mode) {
    gameMode = mode;
    isGameStarted = true;
    
    // Completely hide all menus
    mainMenu.classList.add('hidden');
    singleMenu.classList.add('hidden');
    multiMenu.classList.add('hidden');
    lobbyMenu.classList.add('hidden');
    
    // Hide the blocker completely during gameplay unless paused
    blocker.style.display = 'flex'; // Changed to flex so it shows instructions if unlock happens
    blocker.classList.remove('hidden'); // We control it with display style now via pointerlock events
    
    uiContainer.classList.remove('hidden');

    maxHp = 10;
    hp = 10;
    
    uiHp.innerText = hp;
    
    // Reset game state
    enemies.forEach(e => scene.remove(e.mesh));
    enemies = [];
    zombiesKilled = 0;
    zombiesAlive = 0;
    bullets.forEach(b => scene.remove(b.mesh));
    bullets = [];
    
    // Reset player pos
    controls.getObject().position.set(0, BLOCK_SIZE * 0.8, 0);

    // Only host generates map and starts round in multiplayer, 
    // or if it's singleplayer, we just do it.
    if (mode === 'zombies' || mode === 'bots' || isHost) {
        generateMap();
        startRound();
        
        // If host, tell clients to start and send map
        if (isHost && connections.length > 0) {
            connections.forEach(conn => {
                conn.send({
                    type: 'start_game',
                    mode: gameMode,
                    mapGrid: mapGrid,
                    fixedSpawnPos: fixedSpawnPos
                });
            });
        }
        
        controls.lock(); // Host or singleplayer locks immediately
    } else {
        // Client joining via network needs to lock from the join button click,
        // which is handled in the setupConnection onclick handler.
    }
}

function initPeer(customFallbackId) {
    if (peer) return;
    
    // 从浏览器缓存中获取上次的联机码，如果没有则生成一个 6 位短码
    let savedId = localStorage.getItem('zombie_game_peer_id');
    if (!savedId) {
        savedId = Math.random().toString(36).substring(2, 8).toUpperCase();
        localStorage.setItem('zombie_game_peer_id', savedId);
    }

    let idToUse = customFallbackId || savedId;
    peer = new Peer(idToUse, {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        debug: 2
    });
    
    peer.on('open', id => {
        document.getElementById('my-peer-id').innerText = id;
        document.getElementById('lobby-my-id').innerText = id;
        ingamePeerId.innerText = id;
    });
    
    peer.on('connection', conn => {
        setupConnection(conn);
    });

    peer.on('error', err => {
        console.error('PeerJS error:', err);
        // 如果极小概率碰到了别人在用的 ID，不清除缓存，而是加个随机数重试
        if (err.type === 'unavailable-id') {
            peer.destroy();
            peer = null;
            setTimeout(() => {
                initPeer(idToUse + Math.floor(Math.random() * 10));
            }, 500);
        }
    });
}

// 页面刷新或关闭时，主动释放 PeerJS 连接，防止 ID 被持续占用
window.addEventListener('beforeunload', () => {
    if (peer) {
        peer.destroy();
    }
});

function connectToPeer(id) {
    const conn = peer.connect(id);
    setupConnection(conn);
}

function setupConnection(conn) {
    connections.push(conn);
    
    // Update lobby if host
    if (isHost) {
        updateLobbyPlayers();
    }
    
    // Create companion humanoid mesh
    const humanoid = createHumanoid();
    const compMesh = humanoid.group;
    scene.add(compMesh);
    
    // Add HTML nametag
    const nametag = document.createElement('div');
    nametag.innerText = conn.peer;
    nametag.style.position = 'absolute';
    nametag.style.color = '#55ff55';
    nametag.style.backgroundColor = 'rgba(0,0,0,0.5)';
    nametag.style.padding = '2px 5px';
    nametag.style.borderRadius = '3px';
    nametag.style.fontSize = '14px';
    nametag.style.fontWeight = 'bold';
    nametag.style.pointerEvents = 'none';
    nametag.style.transform = 'translate(-50%, -100%)'; // Center horizontally, above vertically
    nametag.style.display = 'none'; // hidden until in game
    nametag.style.zIndex = '100'; // Make sure it's visible over canvas
    document.getElementById('ui-container').appendChild(nametag);

    companions[conn.peer] = {
        mesh: compMesh,
        parts: humanoid,
        nametag: nametag,
        peerId: conn.peer,
        lastPos: new THREE.Vector3(),
        walkTime: 0
    };

    conn.on('data', data => {
        if (data.type === 'start_game') {
            // Received from host
            mapGrid = data.mapGrid;
            fixedSpawnPos = data.fixedSpawnPos;
            buildMapMeshes(); // We need to build meshes from received grid
            
            // Show the Join button instead of starting directly
            document.getElementById('client-wait-text').classList.add('hidden');
            const joinBtn = document.getElementById('btn-client-join-game');
            joinBtn.classList.remove('hidden');
            
            joinBtn.onclick = () => {
                joinBtn.classList.add('hidden');
                startGame(data.mode);
                startRound(); // Client also needs to initialize round logic
                controls.lock(); // Ensure lock is called directly from button click
            };
        }
        else if (data.type === 'pos') {
            if (companions[conn.peer]) {
                companions[conn.peer].mesh.position.set(data.x, data.y, data.z);
                companions[conn.peer].mesh.rotation.set(data.rx, data.ry, data.rz);
                
                // Update nametag position
                updateNametagPosition(companions[conn.peer].mesh, companions[conn.peer].nametag, conn.peer);
            }
        }
        else if (data.type === 'shoot') {
            playShootSound();
            if (data.pos && data.dir) {
                const p = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z);
                const d = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);
                createPeerBullet(p, d);
            }
        }
        else if (data.type === 'hit_enemy' && isHost) {
            // Client tells host they hit an enemy
            const eIndex = enemies.findIndex(e => e.id === data.id);
            if (eIndex !== -1) {
                enemies[eIndex].hp -= data.damage;
                // Host will broadcast new HP on next frame
                if (enemies[eIndex].hp <= 0) {
                    killZombie(eIndex);
                }
            }
        }
        else if (data.type === 'enemies_sync' && !isHost) {
            // Client receives enemy positions and states from Host
            const receivedIds = new Set(data.enemies.map(e => e.id));
            
            // Remove dead enemies
            for (let i = enemies.length - 1; i >= 0; i--) {
                if (!receivedIds.has(enemies[i].id)) {
                    scene.remove(enemies[i].mesh);
                    enemies.splice(i, 1);
                }
            }
            
            // Update existing or spawn new
            data.enemies.forEach(re => {
                let existing = enemies.find(e => e.id === re.id);
                if (existing) {
                    existing.mesh.position.set(re.x, re.y, re.z);
                    existing.hp = re.hp;
                } else {
                    spawnEnemyFromSync(re);
                }
            });
        }
        else if (data.type === 'enemy_shoot' && !isHost) {
            const p = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z);
            const d = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);
            createEnemyBullet(p, d, data.isFriendly);
            playShootSound();
        }
    });

    conn.on('close', () => {
        if (companions[conn.peer]) {
            scene.remove(companions[conn.peer].mesh);
            companions[conn.peer].nametag.remove();
            delete companions[conn.peer];
        }
        if (isHost) {
            connections = connections.filter(c => c !== conn);
            updateLobbyPlayers();
        }
    });
}

function updateNametagPosition(mesh, nametag, peerId) {
    if (!isGameStarted) {
        nametag.style.display = 'none';
        return;
    }
    
    const pos = mesh.position.clone();
    pos.y += BLOCK_SIZE * 1.5; // Raised a bit higher
    
    // Project to 2D screen space
    pos.project(camera);
    
    // Check if behind camera
    if (pos.z > 1) {
        nametag.style.display = 'none';
        return;
    }
    
    const x = (pos.x * .5 + .5) * window.innerWidth;
    const y = (pos.y * -.5 + .5) * window.innerHeight;
    
    nametag.style.display = 'block';
    nametag.style.left = `${x}px`;
    nametag.style.top = `${y}px`;
    
    // Ensure the text shows both the name and the ID
    nametag.innerHTML = `同伴: <span style="color: #ffaa00;">${peerId}</span>`;
}

function init() {
    setupMenus();
    
    // Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    scene.fog = new THREE.Fog(0x87ceeb, 10, 50);
    
    mapGroup = new THREE.Group();
    scene.add(mapGroup);

    // Setup Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = BLOCK_SIZE * 0.8; // Eye level

    // Setup Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Setup Controls
    controls = new PointerLockControls(camera, document.body);
    
    document.getElementById('blocker').addEventListener('click', function () {
        if (isGameStarted && !isUpgrading) {
            controls.lock();
        }
    });

    controls.addEventListener('lock', function () {
        if (isGameStarted) {
            blocker.style.display = 'none';
        }
    });

    controls.addEventListener('unlock', function () {
        if (isGameStarted && !isUpgrading) {
            blocker.style.display = 'flex';
        }
    });

    scene.add(controls.getObject());

    // Input
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    
    // Weapon UI setup
    setupWeaponView();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -30;
    dirLight.shadow.camera.right = 30;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // Map Generation
    generateMap();

    // Start Round
    // startRound(); // Now called in startGame

    // Upgrade Cards Events
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => {
            const weaponType = card.getAttribute('data-weapon');
            unlockWeapon(weaponType);
            upgradeModal.classList.add('hidden');
            isUpgrading = false;
            controls.lock();
        });
    });

    window.addEventListener('resize', onWindowResize);
}

function createGridTexture(bgColor, lineColor, isGrass = false) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
    
    if (isGrass) {
        // Add noise for grass/dirt
        for(let i=0; i<400; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
            ctx.fillRect(Math.random()*size, Math.random()*size, 4, 4);
        }
    }
    
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, size, size);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // Add pixelated look for minecraft feel
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
}

function generateMap() {
    // 0 = empty, 1 = wall
    // Initialize with walls
    for (let i = 0; i < MAP_SIZE; i++) {
        mapGrid[i] = [];
        for (let j = 0; j < MAP_SIZE; j++) {
            mapGrid[i][j] = 1;
        }
    }

    // Simple random walk for maze carving
    let currX = Math.floor(MAP_SIZE / 2);
    let currZ = Math.floor(MAP_SIZE / 2);
    mapGrid[currX][currZ] = 0;

    const maxSteps = MAP_SIZE * MAP_SIZE * 0.4;
    for (let step = 0; step < maxSteps; step++) {
        const dirs = [
            {x: 0, z: 1}, {x: 0, z: -1}, {x: 1, z: 0}, {x: -1, z: 0}
        ];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        
        let nextX = currX + dir.x;
        let nextZ = currZ + dir.z;
        
        if (nextX > 0 && nextX < MAP_SIZE - 1 && nextZ > 0 && nextZ < MAP_SIZE - 1) {
            currX = nextX;
            currZ = nextZ;
            mapGrid[currX][currZ] = 0;
        }
    }

    // Ensure start area is clear
    const startX = Math.floor(MAP_SIZE / 2);
    const startZ = Math.floor(MAP_SIZE / 2);
    for(let i = -1; i <= 1; i++) {
        for(let j = -1; j <= 1; j++) {
            mapGrid[startX + i][startZ + j] = 0;
        }
    }

    // Set fixed spawn point in a corner
    let spawnI = MAP_SIZE - 2;
    let spawnJ = MAP_SIZE - 2;
    // ensure it's empty
    while(mapGrid[spawnI][spawnJ] !== 0) {
        spawnI--;
        if(spawnI < 1) {
            spawnI = MAP_SIZE - 2;
            spawnJ--;
        }
    }
    fixedSpawnPos = {
        x: (spawnI - MAP_SIZE / 2) * BLOCK_SIZE + BLOCK_SIZE / 2,
        z: (spawnJ - MAP_SIZE / 2) * BLOCK_SIZE + BLOCK_SIZE / 2
    };

    buildMapMeshes();
}

function buildMapMeshes() {
    // Remove old walls/floor safely
    mapGroup.clear();

    // Geometry & Materials
    const wallGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE * 2, BLOCK_SIZE);
    const wallTex = createGridTexture('#808080', '#505050', true); // Stone look
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1.0 });
    
    for (let i = 0; i < MAP_SIZE; i++) {
        for (let j = 0; j < MAP_SIZE; j++) {
            if (mapGrid[i] && mapGrid[i][j] === 1) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                // Position relative to center
                wall.position.x = (i - MAP_SIZE / 2) * BLOCK_SIZE + BLOCK_SIZE / 2;
                wall.position.z = (j - MAP_SIZE / 2) * BLOCK_SIZE + BLOCK_SIZE / 2;
                wall.position.y = BLOCK_SIZE;
                wall.castShadow = true;
                wall.receiveShadow = true;
                mapGroup.add(wall);
            }
        }
    }

    const floorGeo = new THREE.PlaneGeometry(MAP_SIZE * BLOCK_SIZE, MAP_SIZE * BLOCK_SIZE);
    const floorTex = createGridTexture('#3cb043', '#228b22', true); // Grass look
    floorTex.repeat.set(MAP_SIZE, MAP_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1.0 });

    // Floor
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    mapGroup.add(floor);

    // Move player to a safe start spot
    controls.getObject().position.set(0, BLOCK_SIZE * 0.8, 0);
}

function getSafeSpawnPos() {
    let x, z;
    let safe = false;
    while (!safe) {
        let i = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        let j = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        if (mapGrid[i][j] === 0) {
            x = (i - MAP_SIZE / 2) * BLOCK_SIZE + BLOCK_SIZE / 2;
            z = (j - MAP_SIZE / 2) * BLOCK_SIZE + BLOCK_SIZE / 2;
            // Ensure not too close to player
            const px = controls.getObject().position.x;
            const pz = controls.getObject().position.z;
            const dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(z - pz, 2));
            if (dist > BLOCK_SIZE * 10) { // Keep spawn further away (at least 10 blocks)
                safe = true;
            }
        }
    }
    return { x, z };
}

function startRound() {
    zombiesAlive = 0; // Wait 10 seconds before spawning
    zombiesKilled = 0;
    uiZombies.innerText = zombiesKilled;
    uiRound.innerText = round;

    // Set spawn time 4 seconds in the future, so (time - lastZombieSpawnTime > 6000) takes 10s
    lastZombieSpawnTime = performance.now() + 4000;
}

function spawnEnemy() {
    const isBot = gameMode === 'bots' || gameMode === 'multiplayer_team';
    const group = new THREE.Group();

    // Body
    const geo = new THREE.BoxGeometry(BLOCK_SIZE * 0.8, BLOCK_SIZE * 1.8, BLOCK_SIZE * 0.8);
    
    // For team mode, we want more enemies than friendly bots.
    // 20% chance to spawn a friendly bot, 80% chance for an enemy bot
    let isFriendly = false;
    if (isBot && Math.random() < 0.2) {
        isFriendly = true;
    }

    let bodyColor = isBot ? '#0000aa' : '#00aa00';
    let lineColor = isBot ? '#000055' : '#005500';
    
    if (isFriendly) {
        bodyColor = '#00aaaa'; // Cyan for friendly
        lineColor = '#005555';
    }

    const tex = createGridTexture(bodyColor, lineColor, true); 
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1.0 });
    const body = new THREE.Mesh(geo, mat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Eyes
    const eyeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: isBot ? (isFriendly ? 0x00ff00 : 0xffffff) : 0x000000 }); 
    
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.25, 0.5, BLOCK_SIZE * 0.4 + 0.05);
    group.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.25, 0.5, BLOCK_SIZE * 0.4 + 0.05);
    group.add(rightEye);
    
    const pos = getSafeSpawnPos();
    group.position.set(pos.x, BLOCK_SIZE * 0.9, pos.z);
    
    const eId = isHost ? enemyIdCounter++ : -1;

    scene.add(group);
    enemies.push({
        id: eId,
        mesh: group,
        type: isBot ? 'bot' : 'zombie',
        isFriendly: isFriendly,
        hp: 20, // All enemies and bots have 20 HP (takes 2 hits of 10 damage)
        speed: isBot ? 3 : 2 + Math.random() * 1,
        lastAttackTime: performance.now() // bots shoot right away or after a bit
    });
}

function spawnEnemyFromSync(data) {
    const group = new THREE.Group();

    // Body
    const geo = new THREE.BoxGeometry(BLOCK_SIZE * 0.8, BLOCK_SIZE * 1.8, BLOCK_SIZE * 0.8);
    
    let bodyColor = data.type === 'bot' ? '#0000aa' : '#00aa00';
    let lineColor = data.type === 'bot' ? '#000055' : '#005500';
    if (data.isFriendly) {
        bodyColor = '#00aaaa';
        lineColor = '#005555';
    }

    const tex = createGridTexture(bodyColor, lineColor, true); 
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1.0 });
    const body = new THREE.Mesh(geo, mat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Eyes
    const eyeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: data.type === 'bot' ? (data.isFriendly ? 0x00ff00 : 0xffffff) : 0x000000 }); 
    
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.25, 0.5, BLOCK_SIZE * 0.4 + 0.05);
    group.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.25, 0.5, BLOCK_SIZE * 0.4 + 0.05);
    group.add(rightEye);
    
    group.position.set(data.x, data.y, data.z);
    
    scene.add(group);
    enemies.push({
        id: data.id,
        mesh: group,
        type: data.type,
        isFriendly: data.isFriendly,
        hp: data.hp,
        speed: 0,
        lastAttackTime: 0
    });
}

function createPeerBullet(startPos, dir) {
    const bulletGeo = new THREE.BoxGeometry(0.1, 0.1, 0.3);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow like player
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    
    bullet.position.copy(startPos);
    bullet.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), dir);
    
    scene.add(bullet);
    
    bullets.push({
        mesh: bullet,
        dir: dir,
        distanceTraveled: 0,
        maxDistance: BLOCK_SIZE * 15,
        speed: 40,
        isEnemy: false,
        isFriendlyBot: true // Peer bullets can hurt enemies
    });
}

function createHumanoid() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0055ff, roughness: 0.8 }); // Blue shirt
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.6 }); // Skin color
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }); // Dark pants

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.45;
    group.add(head);

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.4), mat);
    body.position.y = 0.85;
    group.add(body);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.25, 0.7, 0.25);
    armGeo.translate(0, -0.25, 0); // Pivot at shoulder
    
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.55, 1.1, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(0.55, 1.1, 0);
    group.add(rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.35, 0.7, 0.35);
    legGeo.translate(0, -0.35, 0); // Pivot at hip
    
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.2, 0.5, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.2, 0.5, 0);
    group.add(rightLeg);

    // Gun in right hand
    const gunGeo = new THREE.BoxGeometry(0.1, 0.1, 0.8);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0, -0.4, -0.3);
    rightArm.add(gun);

    return { group, leftArm, rightArm, leftLeg, rightLeg };
}

function setupWeaponView() {
    // Attach a group to camera for weapon rendering
    camera.add(weaponGroup);
    weaponGroup.position.set(0.5, -0.4, -0.8); // Bottom right
    
    createGun('sniper');
}

function createSword() {
    weaponGroup.clear();
    const swordGeo = new THREE.BoxGeometry(0.05, 0.05, 1.2);
    const swordMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 1.0 });
    weaponMesh = new THREE.Mesh(swordGeo, swordMat);
    weaponMesh.position.set(0.3, -0.3, -0.6);
    
    // Crossguard
    const guardGeo = new THREE.BoxGeometry(0.3, 0.06, 0.06);
    const guardMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.z = 0.4;
    weaponMesh.add(guard);

    weaponGroup.add(weaponMesh);
    currentWeapon = 'sword';
    uiWeapon.innerText = '长剑';
}

function createGun(type) {
    weaponGroup.clear();
    
    const gunGroup = new THREE.Group();
    
    // Barrel
    const barrelGeo = new THREE.BoxGeometry(0.1, 0.1, type === 'sniper' ? 1.4 : 0.8);
    let color = 0x333333;
    if (type === 'sniper') color = 0x111111;
    if (type === 'shotgun') color = 0x5c4033;
    if (type === 'flamethrower') color = 0xcc4400;
    if (type === 'smg') color = 0x444444;
    const barrelMat = new THREE.MeshStandardMaterial({ color: color, roughness: 1.0 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.z = type === 'sniper' ? -0.5 : -0.2;
    gunGroup.add(barrel);
    
    // Body/Grip
    const bodyGeo = new THREE.BoxGeometry(0.12, 0.25, 0.3);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -0.15;
    body.position.z = 0.1;
    gunGroup.add(body);
    
    // Front sight or Scope
    if (type === 'sniper') {
        const scopeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.4);
        const scopeMat = new THREE.MeshStandardMaterial({ color: 0x050505 });
        const scope = new THREE.Mesh(scopeGeo, scopeMat);
        scope.position.y = 0.08;
        scope.position.z = -0.1;
        gunGroup.add(scope);
    } else {
        const sightGeo = new THREE.BoxGeometry(0.02, 0.05, 0.05);
        const sightMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const sight = new THREE.Mesh(sightGeo, sightMat);
        sight.position.y = 0.07;
        sight.position.z = -0.55;
        gunGroup.add(sight);
    }

    gunGroup.position.set(0.4, -0.4, -0.6);
    weaponMesh = gunGroup;
    weaponGroup.add(weaponMesh);
    
    currentWeapon = type;
    hasGun = true;
    let weaponName = '手枪';
    if(type === 'sniper') weaponName = '狙击步枪';
    if(type === 'shotgun') weaponName = '散弹枪';
    if(type === 'flamethrower') weaponName = '喷火枪';
    if(type === 'smg') weaponName = '连发枪';
    uiWeapon.innerText = weaponName;
}

function unlockWeapon(type) {
    if (type === 'heal') {
        hp = maxHp; // Full heal to 10
        uiHp.innerText = Math.ceil(hp);
    } else if (type === 'range') {
        let increase = rangeUpgradeCount === 0 ? 5 : 3;
        sniperRangeBase += increase;
        rangeUpgradeCount++;
    } else {
        createGun(type);
    }
}

function checkCollision(position) {
    // Map grid collision
    const i = Math.floor((position.x + (MAP_SIZE / 2) * BLOCK_SIZE) / BLOCK_SIZE);
    const j = Math.floor((position.z + (MAP_SIZE / 2) * BLOCK_SIZE) / BLOCK_SIZE);
    
    if (i >= 0 && i < MAP_SIZE && j >= 0 && j < MAP_SIZE) {
        if (mapGrid[i][j] === 1) {
            return true;
        }
    }
    return false;
}

function createEnemyBullet(enemyPos, dir, isFriendlyBullet = false) {
    const bulletGeo = new THREE.BoxGeometry(0.1, 0.1, 0.3);
    const bulletMat = new THREE.MeshBasicMaterial({ color: isFriendlyBullet ? 0x00ff00 : 0xff0000 }); 
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    
    // Position bullet slightly in front of enemy
    const startPos = enemyPos.clone().add(dir.clone().multiplyScalar(1.0));
    startPos.y += 0.5; // Chest height
    
    bullet.position.copy(startPos);
    bullet.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), dir);
    
    scene.add(bullet);
    
    bullets.push({
        mesh: bullet,
        dir: dir,
        distanceTraveled: 0,
        maxDistance: BLOCK_SIZE * 15, 
        speed: 20, 
        isEnemy: !isFriendlyBullet,
        isFriendlyBot: isFriendlyBullet
    });
}

function createBullet() {
    const bulletGeo = new THREE.BoxGeometry(0.1, 0.1, 0.3);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    
    // Position bullet at the gun's barrel tip
    // We get world position and direction from the camera
    const startPos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    
    camera.getWorldPosition(startPos);
    camera.getWorldDirection(dir);
    
    // Move starting position slightly forward and right to match gun barrel
    startPos.add(dir.clone().multiplyScalar(1.0)); // forward
    
    bullet.position.copy(startPos);
    
    // Rotate bullet to face direction
    bullet.quaternion.copy(camera.quaternion);
    
    scene.add(bullet);
    
    bullets.push({
            mesh: bullet,
            dir: dir,
            distanceTraveled: 0,
            maxDistance: currentWeapon === 'sniper' ? BLOCK_SIZE * sniperRangeBase : BLOCK_SIZE * 5,
            speed: 40 // fast bullet
        });

        if (peer && connections.length > 0) {
            connections.forEach(conn => conn.send({
                type: 'shoot',
                pos: {x: startPos.x, y: startPos.y, z: startPos.z},
                dir: {x: dir.x, y: dir.y, z: dir.z}
            }));
        }
    }

function attack(type) {
    // Animate weapon
    if (weaponMesh) {
        weaponMesh.position.z -= 0.2;
        setTimeout(() => {
            if (weaponMesh) weaponMesh.position.z += 0.2;
        }, 100);
    }

    if (type === 'gun') {
        createBullet();
        playShootSound();
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Range: 1.5 blocks for sword, custom for sniper, 5 for others
    let maxDist = BLOCK_SIZE * 5;
    if (type === 'sword') maxDist = BLOCK_SIZE * 1.5;
    if (currentWeapon === 'sniper') maxDist = BLOCK_SIZE * sniperRangeBase;
    
    // Intersect against all children in the enemy groups
    const zombieObjects = [];
    enemies.forEach(z => {
        zombieObjects.push(...z.mesh.children);
    });

    const intersects = raycaster.intersectObjects(zombieObjects);
    
    if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.distance <= maxDist) {
            // Find which enemy group the hit object belongs to
            const zombieIndex = enemies.findIndex(z => z.mesh === hit.object.parent);
            if (zombieIndex !== -1) {
                const e = enemies[zombieIndex];
                if (e.isFriendly) return; // Don't hurt friendly bots
                
                let damage = 10; // Default 10 dmg for sword and sniper (2 hits to kill 20 HP)
                if (currentWeapon === 'shotgun') damage = 25;
                if (currentWeapon === 'smg') damage = 8;
                if (currentWeapon === 'flamethrower') damage = 5;
                
                enemies[zombieIndex].hp -= damage;
                playHitSound();
                
                // Flash red on the hit object (body or eye)
                const originalColor = hit.object.material.color ? hit.object.material.color.getHex() : null;
                if (hit.object.material.color) {
                    hit.object.material.color.setHex(0xff0000);
                    setTimeout(() => {
                        if (hit.object && hit.object.material && originalColor !== null) {
                            hit.object.material.color.setHex(originalColor);
                        }
                    }, 100);
                }

                if (enemies[zombieIndex].hp <= 0) {
                    killZombie(zombieIndex);
                }
                
                // If multiplayer client, tell host we hit it
                if (!isHost && gameMode.startsWith('multiplayer')) {
                    if (peer && connections.length > 0) {
                        connections[0].send({ type: 'hit_enemy', id: enemies[zombieIndex].id, damage: damage });
                    }
                }
            }
        }
    }
}

function killZombie(index) {
    const z = enemies[index];
    createExplosion(z.mesh.position);
    scene.remove(z.mesh);
    enemies.splice(index, 1);
    zombiesAlive--;
    zombiesKilled++;
    uiZombies.innerText = zombiesKilled;

    // Trigger upgrade every 10 kills
    if (zombiesKilled > 0 && zombiesKilled % 10 === 0) {
        triggerUpgrade();
    }
}

function triggerUpgrade() {
    isUpgrading = true;
    controls.unlock();
    upgradeModal.classList.remove('hidden');
    
    // Update range upgrade text based on count
    let nextIncrease = rangeUpgradeCount === 0 ? 5 : 3;
    document.getElementById('range-upgrade-title').innerText = `攻击范围 +${nextIncrease}`;
    document.getElementById('range-upgrade-desc').innerText = `当前狙击范围: ${sniperRangeBase} -> ${sniperRangeBase + nextIncrease}`;
}

let isShooting = false;
let lastShootTime = 0;

function onMouseDown(event) {
    if (!controls.isLocked) return;

    if (event.button === 0) { // Left click
        if (hasGun) {
            isShooting = true;
            const time = performance.now();
            let fireRate = 0.5;
            if (currentWeapon === 'sniper') fireRate = 0.5; // Changed back to 0.5s per shot
            if (currentWeapon === 'smg') fireRate = 0.1;
            if (currentWeapon === 'flamethrower') fireRate = 0.05;
            if (currentWeapon === 'shotgun') fireRate = 0.8;
            
            if (time - lastShootTime > fireRate * 1000) {
                attack('gun');
                lastShootTime = time;
            }
        }
    } else if (event.button === 2) { // Right click
        const time = performance.now();
        if (time - lastShootTime > 500) { // Sword attack rate
            attack('sword');
            lastShootTime = time;
        }
    }
}

function onMouseUp(event) {
    if (event.button === 0) {
        isShooting = false;
    }
}

document.addEventListener('mouseup', onMouseUp);

function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = true;
            break;
        case 'Space':
            if (canJump === true) velocity.y += 10;
            canJump = false;
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = false;
            break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function drawMinimap() {
    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    const cellSize = minimapCanvas.width / MAP_SIZE;

    // Draw Map
    for (let i = 0; i < MAP_SIZE; i++) {
        for (let j = 0; j < MAP_SIZE; j++) {
            if (mapGrid[i][j] === 1) {
                minimapCtx.fillStyle = '#555';
                minimapCtx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
            }
        }
    }

    // Convert world pos to grid pos
    function worldToGrid(x, z) {
        return {
            x: (x + (MAP_SIZE / 2) * BLOCK_SIZE) / BLOCK_SIZE,
            y: (z + (MAP_SIZE / 2) * BLOCK_SIZE) / BLOCK_SIZE
        };
    }

    // Draw Zombies/Bots
    enemies.forEach(e => {
        const gridPos = worldToGrid(e.mesh.position.x, e.mesh.position.z);
        if (e.isFriendly) {
            minimapCtx.fillStyle = '#0ff'; // Cyan for friendly
        } else {
            minimapCtx.fillStyle = '#f00'; // Red for enemies
        }
        minimapCtx.beginPath();
        minimapCtx.arc(gridPos.x * cellSize, gridPos.y * cellSize, cellSize * 0.4, 0, Math.PI * 2);
        minimapCtx.fill();
    });

    // Draw Player
    if (controls) {
        const pPos = controls.getObject().position;
        const pGrid = worldToGrid(pPos.x, pPos.z);
        minimapCtx.fillStyle = '#0f0';
        minimapCtx.beginPath();
        minimapCtx.arc(pGrid.x * cellSize, pGrid.y * cellSize, cellSize * 0.5, 0, Math.PI * 2);
        minimapCtx.fill();

        // Draw player direction
        minimapCtx.strokeStyle = '#0f0';
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.moveTo(pGrid.x * cellSize, pGrid.y * cellSize);
        
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        minimapCtx.lineTo((pGrid.x + dir.x * 2) * cellSize, (pGrid.y + dir.z * 2) * cellSize);
        minimapCtx.stroke();
    }
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (isGameStarted && controls.isLocked === true) {
            // Player Movement
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        // Speed is exactly 1 block per sec
        const targetSpeed = BLOCK_SIZE; 
        
        if (moveForward) velocity.z = -targetSpeed;
        else if (moveBackward) velocity.z = targetSpeed;
        else velocity.z = 0;

        if (moveLeft) velocity.x = -targetSpeed;
        else if (moveRight) velocity.x = targetSpeed;
        else velocity.x = 0;

        // Apply movement
        controls.moveRight(velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Player Collision
        const pos = controls.getObject().position;
        const radius = 0.3;
        if (checkCollision(new THREE.Vector3(pos.x + radius, pos.y, pos.z)) ||
            checkCollision(new THREE.Vector3(pos.x - radius, pos.y, pos.z)) ||
            checkCollision(new THREE.Vector3(pos.x, pos.y, pos.z + radius)) ||
            checkCollision(new THREE.Vector3(pos.x, pos.y, pos.z - radius))) {
            
            // Revert movement (naive collision)
            controls.moveRight(-velocity.x * delta);
            controls.moveForward(velocity.z * delta);
        }

        // Apply gravity
        velocity.y -= 30.0 * delta;

        pos.y += (velocity.y * delta);

        if (pos.y < BLOCK_SIZE * 0.8) {
            velocity.y = 0;
            pos.y = BLOCK_SIZE * 0.8;
            canJump = true;
        }

        // Continuous shooting
        if (isShooting && hasGun) {
            let fireRate = 0.5; // default
            if (currentWeapon === 'sniper') fireRate = 0.5; // Changed back to 0.5s per shot
            if (currentWeapon === 'smg') fireRate = 0.1;
            if (currentWeapon === 'flamethrower') fireRate = 0.05;
            if (currentWeapon === 'shotgun') fireRate = 0.8;
            
            if (time - lastShootTime > fireRate * 1000) {
                attack('gun');
                lastShootTime = time;
            }
        }

        // Update bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            const moveDist = b.speed * delta;
            b.mesh.position.add(b.dir.clone().multiplyScalar(moveDist));
            b.distanceTraveled += moveDist;
            
            let hitPlayer = false;
            let hitEnemy = false;
            
            if (b.isEnemy) {
                // Check if enemy bullet hits player
                const pPos = controls.getObject().position;
                if (b.mesh.position.distanceTo(pPos) < 1.5) {
                    hitPlayer = true;
                    hp -= 0.5; // 2 hits = 1 HP damage
                    uiHp.innerText = Math.ceil(hp);
                    playHitSound();
                    
                    document.getElementById('blocker').style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
                    document.getElementById('blocker').style.display = 'block';
                    setTimeout(() => {
                        if (controls.isLocked) {
                            document.getElementById('blocker').style.display = 'none';
                        }
                        document.getElementById('blocker').style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                    }, 100);

                    if (hp <= 0) {
                        alert("游戏结束! 击杀数: " + zombiesKilled);
                        location.reload();
                    }
                }
            } else if (b.isFriendlyBot) {
                // Friendly bot bullet hits enemy bots
                for (let j = 0; j < enemies.length; j++) {
                    const e = enemies[j];
                    if (!e.isFriendly && b.mesh.position.distanceTo(e.mesh.position) < 1.5) {
                        hitEnemy = true;
                        e.hp -= 10;
                        playHitSound();
                        
                        if (e.mesh.children[0].material.color) {
                            e.mesh.children[0].material.color.setHex(0xff0000);
                            setTimeout(() => {
                                if (e.mesh && e.mesh.children[0] && e.mesh.children[0].material) {
                                    e.mesh.children[0].material.color.setHex(0x000055); // Original bot color approx
                                }
                            }, 100);
                        }

                        if (e.hp <= 0) {
                            killZombie(j);
                        }
                        break;
                    }
                }
            }

            // Check collision with walls for visual effect
            if (b.distanceTraveled >= b.maxDistance || checkCollision(b.mesh.position) || hitPlayer || hitEnemy) {
                scene.remove(b.mesh);
                bullets.splice(i, 1);
            }
        }

        // Update particles (blood/gibs)
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.vel.y -= 25 * delta; // Gravity
            p.mesh.position.add(p.vel.clone().multiplyScalar(delta));
            
            // Floor collision
            if (p.mesh.position.y < BLOCK_SIZE * 0.1) {
                p.mesh.position.y = BLOCK_SIZE * 0.1;
                p.vel.y *= -0.3; // bounce
                p.vel.x *= 0.8; // friction
                p.vel.z *= 0.8;
            }
            
            p.life -= delta;
            if (p.life <= 0) {
                scene.remove(p.mesh);
                particles.splice(i, 1);
            }
        }

        // Zombie/Bot AI (Only Host or Singleplayer runs AI)
        const isClient = !isHost && gameMode.startsWith('multiplayer');
        
        const playerPos = controls.getObject().position;
        
        if (!isClient) {
            enemies.forEach(e => {
                const ePos = e.mesh.position;
                const dir = new THREE.Vector3().subVectors(playerPos, ePos);
                dir.y = 0; 
                
                e.mesh.lookAt(playerPos.x, ePos.y, playerPos.z);

                if (e.type === 'bot') {
                    if (e.isFriendly) {
                            // Friendly bots actively seek and fight enemies
                            let nearestEnemy = null;
                            let minDist = Infinity;
                            enemies.forEach(other => {
                                if (!other.isFriendly) {
                                    const dist = ePos.distanceTo(other.mesh.position);
                                    if (dist < minDist) {
                                        minDist = dist;
                                        nearestEnemy = other;
                                    }
                                }
                            });
                            
                            if (nearestEnemy) {
                                e.mesh.lookAt(nearestEnemy.mesh.position.x, ePos.y, nearestEnemy.mesh.position.z);
                                // Move towards enemy if too far
                                if (minDist > BLOCK_SIZE * 5) {
                                    const moveDir = new THREE.Vector3().subVectors(nearestEnemy.mesh.position, ePos).normalize();
                                    const nextPos = ePos.clone().add(moveDir.clone().multiplyScalar(e.speed * delta));
                                    if (!checkCollision(nextPos)) {
                                        e.mesh.position.copy(nextPos);
                                    }
                                }
                                
                                // Shoot at nearest enemy
                                if (time - e.lastAttackTime > 2000) {
                                    if (minDist < BLOCK_SIZE * 15) {
                                        const shootDir = new THREE.Vector3().subVectors(nearestEnemy.mesh.position, ePos).normalize();
                                        createEnemyBullet(ePos, shootDir, true); // true = friendly bullet
                                        playShootSound();
                                        e.lastAttackTime = time;
                                        
                                        if (isHost && connections.length > 0) {
                                            connections.forEach(c => c.send({type: 'enemy_shoot', pos: {x: ePos.x, y: ePos.y, z: ePos.z}, dir: {x: shootDir.x, y: shootDir.y, z: shootDir.z}, isFriendly: true}));
                                        }
                                    }
                                }
                            } else {
                                // If no enemies, follow player
                                if (dir.length() > BLOCK_SIZE * 5) {
                                    dir.normalize();
                                    const nextPos = ePos.clone().add(dir.clone().multiplyScalar(e.speed * delta));
                                    if (!checkCollision(nextPos)) {
                                        e.mesh.position.copy(nextPos);
                                    }
                                }
                            }
                    } else {
                        // Enemy bots attack player OR friendly bots (whoever is closer)
                        let targetPos = playerPos;
                        let nearestFriendly = null;
                        let minDistToTarget = ePos.distanceTo(playerPos);
                        
                        enemies.forEach(other => {
                            if (other.isFriendly) {
                                const dist = ePos.distanceTo(other.mesh.position);
                                if (dist < minDistToTarget) {
                                    minDistToTarget = dist;
                                    nearestFriendly = other;
                                }
                            }
                        });
                        
                        if (nearestFriendly) {
                            targetPos = nearestFriendly.mesh.position;
                        }
                        
                        const moveDir = new THREE.Vector3().subVectors(targetPos, ePos);
                        moveDir.y = 0;
                        e.mesh.lookAt(targetPos.x, ePos.y, targetPos.z);
                        
                        if (moveDir.length() > BLOCK_SIZE * 4) { // Keep some distance from target
                            moveDir.normalize();
                            const nextPos = ePos.clone().add(moveDir.clone().multiplyScalar(e.speed * delta));
                            if (!checkCollision(nextPos)) {
                                e.mesh.position.copy(nextPos);
                            }
                        }
                        
                        // Bot shooting
                        if (time - e.lastAttackTime > 2000) { // Shoot every 2 seconds
                            if (minDistToTarget < BLOCK_SIZE * 15) {
                                moveDir.normalize();
                                createEnemyBullet(ePos, moveDir, false);
                                playShootSound();
                                e.lastAttackTime = time;
                                
                                if (isHost && connections.length > 0) {
                                    connections.forEach(c => c.send({type: 'enemy_shoot', pos: {x: ePos.x, y: ePos.y, z: ePos.z}, dir: {x: moveDir.x, y: moveDir.y, z: moveDir.z}, isFriendly: false}));
                                }
                            }
                        }
                    }
                } else {
                    // Zombie behavior
                    if (dir.length() > BLOCK_SIZE * 0.8) {
                        dir.normalize();
                        const nextPos = ePos.clone().add(dir.clone().multiplyScalar(e.speed * delta));
                        
                        if (!checkCollision(nextPos)) {
                            e.mesh.position.copy(nextPos);
                        } else {
                            if (!checkCollision(new THREE.Vector3(nextPos.x, ePos.y, ePos.z))) {
                                e.mesh.position.x = nextPos.x;
                            } else if (!checkCollision(new THREE.Vector3(ePos.x, ePos.y, nextPos.z))) {
                                e.mesh.position.z = nextPos.z;
                            }
                        }
                    } else {
                        if (time - e.lastAttackTime > 1000) { 
                            hp -= 0.5; // 2 hits = 1 HP damage
                            uiHp.innerText = Math.ceil(hp);
                            e.lastAttackTime = time;
                            
                            document.getElementById('blocker').style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
                            document.getElementById('blocker').style.display = 'block';
                            setTimeout(() => {
                                if (controls.isLocked) {
                                    document.getElementById('blocker').style.display = 'none';
                                }
                                document.getElementById('blocker').style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                            }, 100);

                            if (hp <= 0) {
                                alert("游戏结束! 击杀僵尸数: " + zombiesKilled);
                                location.reload();
                            }
                        }
                    }
                }
            });

            // Spawn new enemy every 6 seconds
            if (time - lastZombieSpawnTime > 6000) {
                spawnEnemy();
                lastZombieSpawnTime = time;
                zombiesAlive++;
            }
        } else {
            // Client only needs to make enemies face them to look natural
            enemies.forEach(e => {
                e.mesh.lookAt(playerPos.x, e.mesh.position.y, playerPos.z);
            });
        }
        
        // PeerJS broadcast pos & enemies (Throttled to ~15 FPS to prevent network freeze)
        if (peer && connections.length > 0) {
            if (time - lastSyncTime > 66) { // 1000ms / 15 = 66ms
                const p = controls.getObject().position;
                const r = camera.rotation;
                
                // Broadcast self position
                connections.forEach(conn => {
                    conn.send({
                        type: 'pos',
                        x: p.x, y: p.y, z: p.z,
                        rx: r.x, ry: r.y, rz: r.z
                    });
                });
                
                // If Host, broadcast enemy states
                if (isHost) {
                    const syncData = enemies.map(e => ({
                        id: e.id, x: e.mesh.position.x, y: e.mesh.position.y, z: e.mesh.position.z, 
                        hp: e.hp, isFriendly: e.isFriendly, type: e.type
                    }));
                    connections.forEach(conn => conn.send({ type: 'enemies_sync', enemies: syncData }));
                }
                
                lastSyncTime = time;
            }
        }
    }

    // Animate companions and update nametags
    if (isGameStarted && peer && connections.length > 0) {
        Object.values(companions).forEach(comp => {
            if (!comp.mesh || !comp.parts) return;
            
            const dist = comp.mesh.position.distanceTo(comp.lastPos);
            if (dist > 0.01) {
                comp.walkTime += delta * 15;
            } else {
                comp.walkTime = 0;
                // Slowly return to standing
                comp.parts.leftArm.rotation.x *= 0.8;
                comp.parts.rightArm.rotation.x *= 0.8;
                comp.parts.leftLeg.rotation.x *= 0.8;
                comp.parts.rightLeg.rotation.x *= 0.8;
            }
            comp.lastPos.copy(comp.mesh.position);

            if (comp.walkTime > 0) {
                comp.parts.leftArm.rotation.x = Math.sin(comp.walkTime) * 0.8;
                comp.parts.rightArm.rotation.x = -Math.sin(comp.walkTime) * 0.8;
                comp.parts.leftLeg.rotation.x = -Math.sin(comp.walkTime) * 0.8;
                comp.parts.rightLeg.rotation.x = Math.sin(comp.walkTime) * 0.8;
            }
            
            if (comp.nametag) {
                updateNametagPosition(comp.mesh, comp.nametag, comp.peerId);
            }
        });
    }

    drawMinimap();
    renderer.render(scene, camera);
    prevTime = time;
}

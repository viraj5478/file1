(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const hiScoreEl = document.getElementById("hiscore");

  // Logical game size (world units). Canvas is scaled for DPR.
  const WORLD_WIDTH = 800;
  const WORLD_HEIGHT = 300;

  // Device pixel ratio handling
  function resizeForDPR() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(WORLD_WIDTH * dpr);
    canvas.height = Math.floor(WORLD_HEIGHT * dpr);
    canvas.style.width = WORLD_WIDTH + "px";
    canvas.style.height = WORLD_HEIGHT + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeForDPR();
  window.addEventListener("resize", resizeForDPR);

  // Game state
  const GameState = {
    Idle: "idle",
    Playing: "playing",
    Paused: "paused",
    GameOver: "gameover",
  };

  let state = GameState.Idle;

  // World parameters
  let gameSpeed = 6; // in px/frame @ 60fps
  let distanceRan = 0;
  let score = 0;
  let hiScore = Number(localStorage.getItem("trex_highscore") || 0);

  // Ground / floor line
  const GROUND_Y = 258; // Baseline where the dino stands

  // Player (dino)
  class Dino {
    constructor() {
      this.width = 44;
      this.height = 47;
      this.x = 50;
      this.y = GROUND_Y - this.height;
      this.velocityY = 0;
      this.gravity = 0.8;
      this.jumpStrength = 13.5;
      this.isOnGround = true;
      this.legTick = 0;
    }

    get bounds() {
      return { x: this.x + 6, y: this.y + 6, w: this.width - 12, h: this.height - 10 };
    }

    jump() {
      if (this.isOnGround) {
        this.velocityY = -this.jumpStrength;
        this.isOnGround = false;
      }
    }

    update(dt) {
      // Gravity
      this.velocityY += this.gravity * dt;
      this.y += this.velocityY * dt;

      // Floor collision
      if (this.y + this.height >= GROUND_Y) {
        this.y = GROUND_Y - this.height;
        this.velocityY = 0;
        this.isOnGround = true;
      }

      // Foot animation only when running on ground
      if (state === GameState.Playing && this.isOnGround) {
        this.legTick += dt * 0.25 * gameSpeed;
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.fillStyle = "#222";

      // Body (simple stylized dino made of boxes)
      // Head
      ctx.fillRect(this.x + 24, this.y, 20, 16);
      // Snout
      ctx.fillRect(this.x + 44, this.y + 4, 6, 8);
      // Eye
      ctx.clearRect(this.x + 38, this.y + 4, 3, 3);

      // Neck + body
      ctx.fillRect(this.x + 16, this.y + 16, 24, 20);
      ctx.fillRect(this.x, this.y + 24, 32, 20);

      // Tail
      ctx.fillRect(this.x - 8, this.y + 28, 12, 6);

      // Legs animation (alternate)
      const legPhase = Math.floor(this.legTick) % 2;
      if (this.isOnGround) {
        if (legPhase === 0) {
          ctx.fillRect(this.x + 8, this.y + 44, 8, 8);
          ctx.fillRect(this.x + 24, this.y + 44, 8, 4);
        } else {
          ctx.fillRect(this.x + 8, this.y + 44, 8, 4);
          ctx.fillRect(this.x + 24, this.y + 44, 8, 8);
        }
      } else {
        // Air pose
        ctx.fillRect(this.x + 8, this.y + 44, 8, 4);
        ctx.fillRect(this.x + 24, this.y + 44, 8, 4);
      }

      ctx.restore();
    }
  }

  // Obstacles (cacti)
  class Cactus {
    constructor(x, variant = 0) {
      this.x = x;
      this.speed = 0;
      // Different sizes reminiscent of the runner
      const variants = [
        { w: 18, h: 36 },
        { w: 24, h: 48 },
        { w: 34, h: 42 },
        { w: 48, h: 56 },
      ];
      const v = variants[variant % variants.length];
      this.width = v.w;
      this.height = v.h;
      this.y = GROUND_Y - this.height;
    }

    get bounds() {
      return { x: this.x + 4, y: this.y + 4, w: this.width - 8, h: this.height - 8 };
    }

    update(dt) {
      this.x -= this.speed * dt;
    }

    draw(ctx) {
      ctx.save();
      ctx.fillStyle = "#222";

      // Trunk
      ctx.fillRect(this.x + Math.floor(this.width / 2) - 3, this.y, 6, this.height);
      // Arms
      ctx.fillRect(this.x + 2, this.y + 10, 6, 14);
      ctx.fillRect(this.x + this.width - 8, this.y + 18, 6, 12);

      ctx.restore();
    }
  }

  // Clouds for parallax
  class Cloud {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.speed = 0.35; // slow parallax
      this.width = 46;
      this.height = 16;
    }

    update(dt) {
      this.x -= this.speed * dt * gameSpeed;
    }

    draw(ctx) {
      ctx.save();
      ctx.fillStyle = "#ddd";
      roundedRect(ctx, this.x, this.y, this.width, this.height, 8);
      ctx.fill();
      roundedRect(ctx, this.x + 12, this.y - 8, this.width * 0.6, this.height, 8);
      ctx.fill();
      ctx.restore();
    }
  }

  // Ground pattern for movement illusion
  class GroundStrip {
    constructor() {
      this.offset = 0;
      this.segmentWidth = 16;
    }

    update(dt) {
      this.offset += gameSpeed * dt;
      if (this.offset >= this.segmentWidth) {
        this.offset -= this.segmentWidth;
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.strokeStyle = "#cfcfcf";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + 0.5);
      ctx.lineTo(WORLD_WIDTH, GROUND_Y + 0.5);
      ctx.stroke();
      ctx.strokeStyle = "#bdbdbd";
      ctx.lineWidth = 2;
      let x = -this.offset;
      while (x < WORLD_WIDTH) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y + 8.5);
        ctx.lineTo(x + this.segmentWidth * 0.5, GROUND_Y + 8.5);
        ctx.stroke();
        x += this.segmentWidth;
      }
      ctx.restore();
    }
  }

  // Utility: rounded rectangle path
  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Collision check (AABB)
  function intersects(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  // World objects
  const dino = new Dino();
  const ground = new GroundStrip();
  const cacti = [];
  const clouds = [];

  // Spawning
  let cactusSpawnTimer = 0;
  let cactusSpawnInterval = 75; // frames baseline; lower is more frequent

  function resetGame() {
    state = GameState.Playing;
    gameSpeed = 6;
    distanceRan = 0;
    score = 0;
    dino.x = 50;
    dino.y = GROUND_Y - dino.height;
    dino.velocityY = 0;
    dino.isOnGround = true;
    dino.legTick = 0;
    cacti.length = 0;
    clouds.length = 0;
    cactusSpawnTimer = 0;
    cactusSpawnInterval = 75;
    spawnInitialClouds();
    updateScoreUI();
  }

  function spawnInitialClouds() {
    for (let i = 0; i < 4; i++) {
      clouds.push(new Cloud(
        100 + i * 180 + Math.random() * 120,
        40 + Math.random() * 80
      ));
    }
  }

  function spawnCactus() {
    const gapMin = 140;
    const gapMax = 280;
    const variant = Math.floor(Math.random() * 4);
    const lastX = cacti.length ? cacti[cacti.length - 1].x : WORLD_WIDTH + 60;
    const nextX = Math.max(WORLD_WIDTH + 30, lastX + gapMin + Math.random() * (gapMax - gapMin));
    const cactus = new Cactus(nextX, variant);
    cactus.speed = gameSpeed + 0.5;
    cacti.push(cactus);
  }

  function updateScoreUI() {
    scoreEl.textContent = ("00000" + Math.floor(score)).slice(-5);
    hiScoreEl.textContent = "HI " + ("00000" + Math.floor(hiScore)).slice(-5);
  }

  // Input handling
  function handleJump() {
    if (state === GameState.Idle) {
      resetGame();
      return;
    }
    if (state === GameState.GameOver) {
      resetGame();
      return;
    }
    if (state === GameState.Playing) {
      dino.jump();
    }
  }

  function handlePauseToggle() {
    if (state === GameState.Playing) state = GameState.Paused;
    else if (state === GameState.Paused) state = GameState.Playing;
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      handleJump();
    } else if (e.code === "KeyP") {
      handlePauseToggle();
    } else if (e.code === "KeyR") {
      if (state === GameState.GameOver || state === GameState.Idle) resetGame();
    }
  });

  canvas.addEventListener("pointerdown", () => {
    handleJump();
  });

  // Game loop
  let lastTime = performance.now();
  function loop(now) {
    const dtMs = now - lastTime;
    lastTime = now;

    // Normalize dt to ~60fps units (frame = 1)
    const dt = Math.min(3, dtMs / (1000 / 60));

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

  function update(dt) {
    if (state === GameState.Paused) return;

    if (state === GameState.Idle) {
      ground.update(dt);
      clouds.forEach((c) => c.update(dt));
      wrapClouds();
      return;
    }

    if (state === GameState.GameOver) {
      // Let clouds and ground continue for subtle motion
      ground.update(dt);
      clouds.forEach((c) => c.update(dt));
      wrapClouds();
      return;
    }

    // Playing
    const speedIncrease = 0.0025; // progression
    gameSpeed += speedIncrease * dt;

    distanceRan += gameSpeed * dt;
    score = Math.floor(distanceRan / 10);
    if (score > hiScore) {
      hiScore = score;
      localStorage.setItem("trex_highscore", String(hiScore));
    }
    updateScoreUI();

    ground.update(dt);

    // Clouds
    if (Math.random() < 0.01 * dt) {
      clouds.push(new Cloud(WORLD_WIDTH + 30, 40 + Math.random() * 80));
    }
    clouds.forEach((c) => c.update(dt));
    wrapClouds();

    // Dino
    dino.update(dt);

    // Cacti spawning & movement
    cactusSpawnTimer += dt;
    const spawnEvery = Math.max(38, cactusSpawnInterval - gameSpeed * 2);
    if (cactusSpawnTimer >= spawnEvery) {
      cactusSpawnTimer = 0;
      spawnCactus();
    }

    cacti.forEach((c) => {
      c.speed = gameSpeed + 0.5;
      c.update(dt);
    });

    // Remove off-screen cacti
    while (cacti.length && cacti[0].x + cacti[0].width < -40) {
      cacti.shift();
    }

    // Collisions
    const db = dino.bounds;
    for (let i = 0; i < cacti.length; i++) {
      if (intersects(db, cacti[i].bounds)) {
        state = GameState.GameOver;
        break;
      }
    }
  }

  function wrapClouds() {
    for (let i = clouds.length - 1; i >= 0; i--) {
      if (clouds[i].x + clouds[i].width < -20) {
        clouds.splice(i, 1);
      }
    }
  }

  function render() {
    // Clear
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Sky
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Draw clouds
    clouds.forEach((c) => c.draw(ctx));

    // Ground
    ground.draw(ctx);

    // Dino
    dino.draw(ctx);

    // Cacti
    cacti.forEach((c) => c.draw(ctx));

    // Overlays
    drawUIOverlays();
  }

  function drawUIOverlays() {
    ctx.save();
    ctx.fillStyle = "#666";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "12px PressStart2P, monospace";

    if (state === GameState.Idle) {
      ctx.fillText("T-Rex Runner", WORLD_WIDTH / 2, WORLD_HEIGHT / 2 - 26);
      ctx.fillText("Press Space / Tap to start", WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    } else if (state === GameState.Paused) {
      ctx.fillText("Paused (press P)", WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    } else if (state === GameState.GameOver) {
      ctx.fillStyle = "rgba(255,255,255,0.86)";
      ctx.fillRect(WORLD_WIDTH / 2 - 180, WORLD_HEIGHT / 2 - 50, 360, 100);
      ctx.strokeStyle = "#ddd";
      ctx.lineWidth = 2;
      ctx.strokeRect(WORLD_WIDTH / 2 - 180, WORLD_HEIGHT / 2 - 50, 360, 100);

      ctx.fillStyle = "#111";
      ctx.fillText("Game Over", WORLD_WIDTH / 2, WORLD_HEIGHT / 2 - 10);
      ctx.fillText("Press R to restart", WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + 18);
    }

    ctx.restore();
  }

  // Initialize clouds for idle state
  spawnInitialClouds();
  updateScoreUI();

  // Start loop
  requestAnimationFrame(loop);
})();
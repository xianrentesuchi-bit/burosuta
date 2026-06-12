const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ルームごとのゲーム状態を保持するオブジェクト
// rooms[roomCode] = { players: {}, gameState: "SELECT", gameMode: "DUEL" }
let rooms = {};

io.on("connection", (socket) => {
  console.log(`プレイヤーが接続しました: ${socket.id}`);

  // 1. ルームへの入室処理
  socket.on("joinRoom", (roomCode) => {
    // アルファベットは大文字に統一して、前後の空白を削除
    const code = roomCode.toUpperCase().trim();
    
    // 該当ルームがなければ新しく作成
    if (!rooms[code]) {
      rooms[code] = {
        players: {},
        globalGameState: "SELECT",
        globalGameMode: "DUEL"
      };
    }

    // Socket.ioのルーム機能を使ってクライアントを隔離・所属させる
    socket.join(code);
    // ソケット自体にルームコードを記憶させておく（切断時などのため）
    socket.roomCode = code;

    // 新しいプレイヤーの初期データをその部屋用に作成
    rooms[code].players[socket.id] = {
      id: socket.id,
      x: 0,
      y: 0,
      type: null,
      hp: 0,
      maxHp: 0,
      radius: 20,
      speed: 0,
      ammo: 3,
      reloadTimer: 0,
      shootCooldown: 0,
      ultCharge: 0,
      ultActive: false,
      isJumping: false,
      jumpProgress: 0,
      healTimer: 0,
      kbVx: 0,
      kbVy: 0,
      isDashing: false,
      dashAngle: 0,
      dashDistanceTraveled: 0,
      dashMaxDistance: 0,
      cubes: 0,
      longDashTimer: 0,
      facingAngle: 0,
      isBot: false,
      name: "Player"
    };

    // 入室したプレイヤーに現在の「その部屋の」ゲーム状態を同期
    socket.emit("initGameState", {
      players: rooms[code].players,
      gameMode: rooms[code].globalGameMode,
      gameState: rooms[code].globalGameState
    });

    console.log(`ユーザー ${socket.id} がルーム [${code}] に入室しました`);
  });

  // モード切り替えの同期（同じ部屋のメンバーにのみ通知）
  socket.on("changeMode", (mode) => {
    const code = socket.roomCode;
    if (code && rooms[code]) {
      rooms[code].globalGameMode = mode;
      socket.to(code).emit("modeChanged", mode);
    }
  });

  // キャラクターを選択して出撃したとき
  socket.on("joinGame", (data) => {
    const code = socket.roomCode;
    if (code && rooms[code] && rooms[code].players[socket.id]) {
      rooms[code].players[socket.id].type = data.type;
      rooms[code].players[socket.id].x = data.x;
      rooms[code].players[socket.id].y = data.y;
      rooms[code].players[socket.id].hp = data.hp;
      rooms[code].players[socket.id].maxHp = data.maxHp;
      rooms[code].players[socket.id].radius = data.radius;
      rooms[code].players[socket.id].speed = data.speed;
      rooms[code].players[socket.id].name = data.type.name;
      
      rooms[code].globalGameState = "PLAYING";
      
      // ルーム内の全員に通知
      io.to(code).emit("playerJoined", rooms[code].players[socket.id]);
    }
  });

  // リアルタイムの位置・ステータス更新の同期
  socket.on("updateStatus", (statusData) => {
    const code = socket.roomCode;
    if (code && rooms[code] && rooms[code].players[socket.id]) {
      rooms[code].players[socket.id] = { ...rooms[code].players[socket.id], ...statusData };
      // 自分以外のルーム内メンバーに位置変更を送信
      socket.to(code).emit("remotePlayerUpdated", rooms[code].players[socket.id]);
    }
  });

  // 弾が発射されたときのアクション同期
  socket.on("fireBullet", (bulletData) => {
    const code = socket.roomCode;
    if (code) {
      io.to(code).emit("remoteBulletFired", bulletData);
    }
  });

  // キューブ生成・同期
  socket.on("spawnCube", (cubeData) => {
    const code = socket.roomCode;
    if (code) {
      io.to(code).emit("remoteCubeSpawned", cubeData);
    }
  });

  // サンドバッグ同期
  socket.on("updateSandbag", (bagData) => {
    const code = socket.roomCode;
    if (code) {
      io.to(code).emit("remoteSandbagUpdated", bagData);
    }
  });

  // 壁破壊の同期
  socket.on("destroyWall", (wallIdx) => {
    const code = socket.roomCode;
    if (code) {
      io.to(code).emit("remoteWallDestroyed", wallIdx);
    }
  });

  // ゲームオーバー状態の同期
  socket.on("triggerGameOver", (data) => {
    const code = socket.roomCode;
    if (code && rooms[code]) {
      rooms[code].globalGameState = "GAMEOVER";
      io.to(code).emit("remoteGameOver", data);
    }
  });

  // 切断時の処理
  socket.on("disconnect", () => {
    const code = socket.roomCode;
    console.log(`プレイヤーが切断しました: ${socket.id}`);
    if (code && rooms[code]) {
      delete rooms[code].players[socket.id];
      io.to(code).emit("playerLeft", socket.id);

      // 部屋に誰もいなくなったらメモリ解放のためにルームを削除
      if (Object.keys(rooms[code].players).length === 0) {
        delete rooms[code];
        console.log(`ルーム [${code}] の空室に伴う削除を行いました`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました。`);
});

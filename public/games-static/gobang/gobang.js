(function () {
  'use strict'

  var canvas = document.getElementById('canvas')
  var ctx = canvas && canvas.getContext('2d')
  var status = document.getElementById('status')
  var difficulty = document.getElementById('difficulty')
  var restart = document.getElementById('restart')
  var boardAnnouncer = document.getElementById('board-announcer')
  if (!canvas || !ctx || !status || !difficulty || !restart || !boardAnnouncer) return

  var COLS = 15
  var ROWS = 15
  var EMPTY = 0
  var HUMAN = 1
  var COMPUTER = 2
  var embedded = document.documentElement.classList.contains('is-embedded')
  var MARGIN_X = 30
  var MARGIN_Y = 30
  var CELL = 60
  var WIN_SCORE = 10000000
  var directions = [[1, 0], [0, 1], [1, 1], [1, -1]]
  var settings = {
    casual: { depth: 1, candidates: 10 },
    standard: { depth: 2, candidates: 14 },
    challenge: { depth: 3, candidates: 15 },
  }
  var board = []
  var currentPlayer = HUMAN
  var gameOver = false
  var thinking = false
  var moveCount = 0
  var winningLine = []
  var lastMove = null
  var cursorCol = Math.floor(COLS / 2)
  var cursorRow = Math.floor(ROWS / 2)
  var canvasFocused = false

  function emptyBoard() {
    return Array.from({ length: ROWS }, function () { return Array(COLS).fill(EMPTY) })
  }

  function inside(col, row) {
    return col >= 0 && col < COLS && row >= 0 && row < ROWS
  }

  function updateStatus(message, state) {
    var label = status.querySelector('strong')
    var count = status.querySelector('span')
    if (label) label.textContent = message
    if (count) count.textContent = '已落子 ' + moveCount + ' 手'
    status.dataset.state = state || 'ready'
    if (embedded && window.parent !== window) {
      window.parent.postMessage({
        source: 'gobang',
        type: 'status',
        message: message,
        state: state || 'ready',
        moveCount: moveCount,
      }, window.location.origin)
    }
  }

  function boardPointLabel(col, row) {
    return String.fromCharCode(65 + col) + (row + 1)
  }

  function boardPointState(col, row) {
    var piece = board[row][col]
    if (piece === HUMAN) return '你的黑棋'
    if (piece === COMPUTER) return '电脑的白棋'
    return '空位'
  }

  function announceBoardCursor(prefix) {
    var point = boardPointLabel(cursorCol, cursorRow)
    var description = point + '，' + boardPointState(cursorCol, cursorRow)
    canvas.setAttribute('aria-label', '五子棋棋盘，当前 ' + description)
    boardAnnouncer.textContent = prefix ? prefix + ' ' + description : description
  }

  function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#579c8c'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = 'rgba(255,255,255,.72)'
    ctx.lineWidth = 2
    for (var col = 0; col < COLS; col += 1) {
      ctx.beginPath()
      ctx.moveTo(MARGIN_X + col * CELL, MARGIN_Y)
      ctx.lineTo(MARGIN_X + col * CELL, MARGIN_Y + (ROWS - 1) * CELL)
      ctx.stroke()
    }
    for (var row = 0; row < ROWS; row += 1) {
      ctx.beginPath()
      ctx.moveTo(MARGIN_X, MARGIN_Y + row * CELL)
      ctx.lineTo(MARGIN_X + (COLS - 1) * CELL, MARGIN_Y + row * CELL)
      ctx.stroke()
    }

    ;[[3, 3], [7, 3], [11, 3], [3, 7], [7, 7], [11, 7], [3, 11], [7, 11], [11, 11]].forEach(function (point) {
      ctx.beginPath()
      ctx.arc(MARGIN_X + point[0] * CELL, MARGIN_Y + point[1] * CELL, 5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,.62)'
      ctx.fill()
    })

    board.forEach(function (line, boardRow) {
      line.forEach(function (piece, boardCol) {
        if (!piece) return
        var px = MARGIN_X + boardCol * CELL
        var py = MARGIN_Y + boardRow * CELL
        ctx.beginPath()
        ctx.arc(px, py, 22, 0, Math.PI * 2)
        ctx.fillStyle = piece === HUMAN ? '#182825' : '#f8fbfa'
        ctx.shadowColor = 'rgba(10,31,26,.25)'
        ctx.shadowBlur = 5
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = piece === HUMAN ? '#0e1715' : '#c5d8d2'
        ctx.lineWidth = 1.5
        ctx.stroke()
      })
    })

    if (winningLine.length) {
      winningLine.forEach(function (point) {
        ctx.beginPath()
        ctx.arc(MARGIN_X + point.col * CELL, MARGIN_Y + point.row * CELL, 27, 0, Math.PI * 2)
        ctx.strokeStyle = '#f0b74d'
        ctx.lineWidth = 4
        ctx.stroke()
      })
    }

    if (lastMove) {
      var lastX = MARGIN_X + lastMove.col * CELL
      var lastY = MARGIN_Y + lastMove.row * CELL
      ctx.beginPath()
      ctx.arc(lastX, lastY, 29, 0, Math.PI * 2)
      ctx.strokeStyle = '#f0b74d'
      ctx.lineWidth = 3
      ctx.shadowColor = 'rgba(240,183,77,.55)'
      ctx.shadowBlur = 9
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#f0b74d'
      ctx.fill()
    }

    if (canvasFocused) {
      var cursorX = MARGIN_X + cursorCol * CELL
      var cursorY = MARGIN_Y + cursorRow * CELL
      ctx.save()
      ctx.strokeStyle = '#ffd979'
      ctx.lineWidth = 3
      ctx.setLineDash([7, 5])
      ctx.strokeRect(cursorX - 25, cursorY - 25, 50, 50)
      ctx.restore()
    }
  }

  function winningCells(col, row, player) {
    for (var i = 0; i < directions.length; i += 1) {
      var direction = directions[i]
      var cells = [{ col: col, row: row }]
      for (var sign = -1; sign <= 1; sign += 2) {
        var nextCol = col + direction[0] * sign
        var nextRow = row + direction[1] * sign
        while (inside(nextCol, nextRow) && board[nextRow][nextCol] === player) {
          if (sign < 0) cells.unshift({ col: nextCol, row: nextRow })
          else cells.push({ col: nextCol, row: nextRow })
          nextCol += direction[0] * sign
          nextRow += direction[1] * sign
        }
      }
      if (cells.length >= 5) return cells
    }
    return []
  }

  function wouldWin(col, row, player) {
    board[row][col] = player
    var result = winningCells(col, row, player).length >= 5
    board[row][col] = EMPTY
    return result
  }

  function immediateWinningMoves(player) {
    var moves = []
    for (var row = 0; row < ROWS; row += 1) {
      for (var col = 0; col < COLS; col += 1) {
        if (board[row][col] === EMPTY && wouldWin(col, row, player)) {
          moves.push({ col: col, row: row })
        }
      }
    }
    return moves
  }

  function forkThreatCount(player) {
    var forks = 0
    for (var row = 0; row < ROWS; row += 1) {
      for (var col = 0; col < COLS; col += 1) {
        if (board[row][col] !== EMPTY) continue
        board[row][col] = player
        var winningReplies = immediateWinningMoves(player).length
        board[row][col] = EMPTY
        if (winningReplies >= 2) forks += 1
      }
    }
    return forks
  }

  function localScore(col, row, player) {
    var total = 0
    directions.forEach(function (direction) {
      var count = 1
      var open = 0
      for (var sign = -1; sign <= 1; sign += 2) {
        var nextCol = col + direction[0] * sign
        var nextRow = row + direction[1] * sign
        while (inside(nextCol, nextRow) && board[nextRow][nextCol] === player) {
          count += 1
          nextCol += direction[0] * sign
          nextRow += direction[1] * sign
        }
        if (inside(nextCol, nextRow) && board[nextRow][nextCol] === EMPTY) open += 1
      }
      if (count >= 5) total += 10000000
      else if (count === 4) total += open === 2 ? 180000 : open === 1 ? 24000 : 1000
      else if (count === 3) total += open === 2 ? 9000 : open === 1 ? 900 : 80
      else if (count === 2) total += open === 2 ? 420 : open === 1 ? 60 : 8
      else if (open === 2) total += 6
    })
    return total
  }

  function windowScore(own, enemy, empty) {
    if (own && enemy) return 0
    if (own === 5) return WIN_SCORE
    if (enemy === 5) return -WIN_SCORE
    if (own === 4 && empty === 1) return 120000
    if (enemy === 4 && empty === 1) return -150000
    if (own === 3 && empty === 2) return 6000
    if (enemy === 3 && empty === 2) return -7500
    if (own === 2 && empty === 3) return 280
    if (enemy === 2 && empty === 3) return -360
    if (own === 1 && empty === 4) return 8
    if (enemy === 1 && empty === 4) return -10
    return 0
  }

  function evaluateBoard() {
    var score = 0
    for (var row = 0; row < ROWS; row += 1) {
      for (var col = 0; col < COLS; col += 1) {
        directions.forEach(function (direction) {
          var endCol = col + direction[0] * 4
          var endRow = row + direction[1] * 4
          if (!inside(endCol, endRow)) return
          var own = 0
          var enemy = 0
          var empty = 0
          for (var offset = 0; offset < 5; offset += 1) {
            var piece = board[row + direction[1] * offset][col + direction[0] * offset]
            if (piece === COMPUTER) own += 1
            else if (piece === HUMAN) enemy += 1
            else empty += 1
          }
          score += windowScore(own, enemy, empty)
        })
      }
    }
    return score
  }

  function candidateMoves(player, includeAll) {
    var occupied = []
    board.forEach(function (line, row) {
      line.forEach(function (piece, col) {
        if (piece) occupied.push({ col: col, row: row })
      })
    })
    if (!occupied.length) return [{ col: Math.floor(COLS / 2), row: Math.floor(ROWS / 2) }]

    var candidates = new Map()
    occupied.forEach(function (point) {
      for (var row = point.row - 2; row <= point.row + 2; row += 1) {
        for (var col = point.col - 2; col <= point.col + 2; col += 1) {
          if (inside(col, row) && board[row][col] === EMPTY) candidates.set(col + ':' + row, { col: col, row: row })
        }
      }
    })
    player = player || COMPUTER
    var sorted = Array.from(candidates.values()).sort(function (a, b) {
      board[a.row][a.col] = player
      var scoreA = localScore(a.col, a.row, player)
      board[a.row][a.col] = EMPTY
      board[b.row][b.col] = player
      var scoreB = localScore(b.col, b.row, player)
      board[b.row][b.col] = EMPTY
      var centerA = Math.abs(a.col - (COLS - 1) / 2) + Math.abs(a.row - (ROWS - 1) / 2)
      var centerB = Math.abs(b.col - (COLS - 1) / 2) + Math.abs(b.row - (ROWS - 1) / 2)
      return scoreB - scoreA || centerA - centerB
    })
    var forced = sorted.filter(function (move) {
      return wouldWin(move.col, move.row, COMPUTER) || wouldWin(move.col, move.row, HUMAN)
    })
    var forcedKeys = new Set(forced.map(function (move) { return move.col + ':' + move.row }))
    var regular = sorted.filter(function (move) { return !forcedKeys.has(move.col + ':' + move.row) })
    var ordered = forced.concat(regular)
    if (includeAll) return ordered
    return ordered.slice(0, Math.max(settings[difficulty.value].candidates, forced.length))
  }

  function minimax(depth, maximizing, alpha, beta, lastMove) {
    if (lastMove && winningCells(lastMove.col, lastMove.row, lastMove.player).length >= 5) {
      return lastMove.player === COMPUTER ? WIN_SCORE + depth : -WIN_SCORE - depth
    }
    if (depth <= 0 || moveCount >= COLS * ROWS) return evaluateBoard()

    var moves = candidateMoves(maximizing ? COMPUTER : HUMAN)
    if (!moves.length) return evaluateBoard()
    if (maximizing) {
      var best = -Infinity
      for (var i = 0; i < moves.length; i += 1) {
        var move = moves[i]
        board[move.row][move.col] = COMPUTER
        moveCount += 1
        var value = minimax(depth - 1, false, alpha, beta, { col: move.col, row: move.row, player: COMPUTER })
        moveCount -= 1
        board[move.row][move.col] = EMPTY
        best = Math.max(best, value)
        alpha = Math.max(alpha, best)
        if (beta <= alpha) break
      }
      return best
    }

    var worst = Infinity
    for (var j = 0; j < moves.length; j += 1) {
      var reply = moves[j]
      board[reply.row][reply.col] = HUMAN
      moveCount += 1
      var replyValue = minimax(depth - 1, true, alpha, beta, { col: reply.col, row: reply.row, player: HUMAN })
      moveCount -= 1
      board[reply.row][reply.col] = EMPTY
      worst = Math.min(worst, replyValue)
      beta = Math.min(beta, worst)
      if (beta <= alpha) break
    }
    return worst
  }

  function chooseComputerMove() {
    var moves = candidateMoves(COMPUTER, true)
    var winningMove = moves.find(function (move) { return wouldWin(move.col, move.row, COMPUTER) })
    if (winningMove) return winningMove

    var humanThreats = immediateWinningMoves(HUMAN)
    if (humanThreats.length === 1) return humanThreats[0]

    // Prefer moves that prevent forks. A shallow search can miss an open three,
    // but it is still visible as multiple immediate winning replies after a move.
    var defensiveMoves = []
    var fewestThreats = Infinity
    var fewestForks = Infinity
    moves.forEach(function (move) {
      board[move.row][move.col] = COMPUTER
      var threats = immediateWinningMoves(HUMAN).length
      var forks = forkThreatCount(HUMAN)
      board[move.row][move.col] = EMPTY
      if (threats < fewestThreats || (threats === fewestThreats && forks < fewestForks)) {
        fewestThreats = threats
        fewestForks = forks
        defensiveMoves = [move]
      } else if (threats === fewestThreats && forks === fewestForks) {
        defensiveMoves.push(move)
      }
    })
    moves = (defensiveMoves.length ? defensiveMoves : moves)
      .slice(0, settings[difficulty.value].candidates)

    var depth = settings[difficulty.value].depth
    var bestValue = -Infinity
    var bestMove = moves[0]
    moves.forEach(function (move) {
      board[move.row][move.col] = COMPUTER
      moveCount += 1
      var value = minimax(depth - 1, false, -Infinity, Infinity, { col: move.col, row: move.row, player: COMPUTER })
      moveCount -= 1
      board[move.row][move.col] = EMPTY
      value += localScore(move.col, move.row, COMPUTER) * 0.35
      if (value > bestValue) {
        bestValue = value
        bestMove = move
      }
    })
    return bestMove
  }

  function place(col, row, player) {
    if (!inside(col, row) || board[row][col] !== EMPTY || gameOver) return false
    board[row][col] = player
    lastMove = { col: col, row: row, player: player }
    moveCount += 1
    winningLine = winningCells(col, row, player)
    if (winningLine.length >= 5) {
      gameOver = true
      updateStatus(player === HUMAN ? '你赢了！' : '电脑获胜', 'over')
    } else if (moveCount >= COLS * ROWS) {
      gameOver = true
      winningLine = []
      updateStatus('和棋，再来一局？', 'over')
    }
    drawBoard()
    return true
  }

  function computerTurn() {
    if (gameOver) return
    var move = chooseComputerMove()
    if (move) {
      place(move.col, move.row, COMPUTER)
      boardAnnouncer.textContent = '电脑在 ' + boardPointLabel(move.col, move.row) + ' 落下白棋。'
    }
    thinking = false
    if (!gameOver) {
      currentPlayer = HUMAN
      updateStatus('你的回合 · 黑棋', 'ready')
    }
    drawBoard()
  }

  function restartGame() {
    board = emptyBoard()
    currentPlayer = HUMAN
    gameOver = false
    thinking = false
    moveCount = 0
    winningLine = []
    lastMove = null
    cursorCol = Math.floor(COLS / 2)
    cursorRow = Math.floor(ROWS / 2)
    updateStatus('你的回合 · 黑棋', 'ready')
    announceBoardCursor('新对局已开始。')
    drawBoard()
  }

  function playHumanMove(col, row) {
    if (thinking) {
      boardAnnouncer.textContent = '电脑正在思考，请稍候。'
      return
    }
    if (gameOver) {
      boardAnnouncer.textContent = '本局已经结束，请重新开始。'
      return
    }
    if (currentPlayer !== HUMAN || !inside(col, row)) return
    cursorCol = col
    cursorRow = row
    if (board[row][col] !== EMPTY) {
      announceBoardCursor('这里已经有棋子。')
      drawBoard()
      return
    }
    if (!place(col, row, HUMAN)) return
    announceBoardCursor('已落下黑棋。')
    if (gameOver) return
    currentPlayer = COMPUTER
    thinking = true
    updateStatus('电脑思考中…', 'thinking')
    window.setTimeout(computerTurn, 140)
  }

  canvas.addEventListener('pointerup', function (event) {
    var rect = canvas.getBoundingClientRect()
    var scaleX = canvas.width / rect.width
    var scaleY = canvas.height / rect.height
    var col = Math.round(((event.clientX - rect.left) * scaleX - MARGIN_X) / CELL)
    var row = Math.round(((event.clientY - rect.top) * scaleY - MARGIN_Y) / CELL)
    playHumanMove(col, row)
  })

  canvas.addEventListener('focus', function () {
    canvasFocused = true
    announceBoardCursor('棋盘已聚焦。')
    drawBoard()
  })

  canvas.addEventListener('blur', function () {
    canvasFocused = false
    drawBoard()
  })

  canvas.addEventListener('keydown', function (event) {
    var handled = true
    if (event.key === 'ArrowLeft') cursorCol = Math.max(0, cursorCol - 1)
    else if (event.key === 'ArrowRight') cursorCol = Math.min(COLS - 1, cursorCol + 1)
    else if (event.key === 'ArrowUp') cursorRow = Math.max(0, cursorRow - 1)
    else if (event.key === 'ArrowDown') cursorRow = Math.min(ROWS - 1, cursorRow + 1)
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      playHumanMove(cursorCol, cursorRow)
      return
    } else handled = false

    if (!handled) return
    event.preventDefault()
    announceBoardCursor()
    drawBoard()
  })

  restart.addEventListener('click', restartGame)
  difficulty.addEventListener('change', restartGame)
  window.addEventListener('message', function (event) {
    if (!embedded || event.origin !== window.location.origin || !event.data || event.data.source !== 'gobang-host') return
    if (event.data.type === 'restart') restartGame()
    if (event.data.type === 'set-difficulty' && settings[event.data.value]) {
      difficulty.value = event.data.value
      restartGame()
    }
  })
  restartGame()
}())

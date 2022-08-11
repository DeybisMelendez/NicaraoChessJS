import {Chess} from "./chess.js"
import {nicarao} from "./nicarao.js"
var game = new Chess()
var config = {
    draggable: true,
    position: game.fen(),
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
}
var board = Chessboard("board", config)
var promotion = "q"
var gameturn = 1
var gamedepth = 4
var pgn = document.getElementById("pgn")
var set = document.getElementById("set")
var move = document.getElementById("move")
var undo = document.getElementById("undo")
var flip = document.getElementById("flip")
var promoDropdown = document.getElementById("promo")
set.addEventListener("click",setBoard)
flip.addEventListener("click",()=>board.flip())
move.addEventListener("click",()=>nicaraoMove(gameturn,gamedepth))
undo.addEventListener("click",()=>undoMove())
document.getElementById("queenPromotion").addEventListener("click",()=>{promotion="q";promoDropdown.innerHTML = "Queen"})
document.getElementById("knightPromotion").addEventListener("click",()=>{promotion="n";promoDropdown.innerHTML = "Knight"})
document.getElementById("rookPromotion").addEventListener("click",()=>{promotion="r";promoDropdown.innerHTML = "Rook"})
document.getElementById("bishopPromotion").addEventListener("click",()=>{promotion="b";promoDropdown.innerHTML = "Bishop"})
function undoMove() {
    if (game.history().length > 0) {
        game.undo()
        board.position(game.fen())
        pgn.innerHTML = game.pgn()
    }
}

function setBoard(){
    var fen = document.getElementById("fen").value
    var valid = game.validate_fen(fen)
    if (valid.valid) {
        game.clear()
        game.load(fen)
        board.position(fen)
    } else {
        alert("FEN is not valid")
    }
}

function onDragStart (source, piece, position, orientation) {
    // do not pick up pieces if the game is over
    if (game.game_over()) return false
  
    // only pick up pieces for the side to move
    if (game.turn() === 'w' && piece.search(/^b/) !== -1){
      return false
    }
  }
function onDrop (source, target) {
    // see if the move is legal
    var move = game.move({
        from: source,
        to: target,
        promotion: promotion
    })
    // illegal move
    if (move === null) return 'snapback'

}

// update the board position after the piece snap
// for castling, en passant, pawn promotion
function onSnapEnd () {
    board.position(game.fen())
    pgn.innerHTML = game.pgn()
    setTimeout(nicaraoMove,300,gameturn,gamedepth)
}

function nicaraoMove(turn, depth) {
    var bestmove = nicarao(game,depth,turn)
    game.move(bestmove)
    board.position(game.fen())
    pgn.innerHTML = game.pgn()
}
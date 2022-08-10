import {Chess} from "./chess.js"
import {nicarao} from "./nicarao.js"
var pgn = document.getElementById("pgn")
var game = new Chess("1n3NR1/2B1R3/2pK1p2/2N2p2/5kbp/1r1p4/3ppr2/4b1QB w - - 0 1")
var config = {
    draggable: true,
    position: game.fen(),
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    //orientation: "black",
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
        promotion: 'q' // NOTE: always promote to a queen for example simplicity
    })
    // illegal move
    if (move === null) return 'snapback'

}

// update the board position after the piece snap
// for castling, en passant, pawn promotion
function onSnapEnd () {
    board.position(game.fen())
    pgn.innerHTML = "PGN: " + game.pgn()
    nicaraoMove(gameturn,gamedepth)
}
var board = Chessboard("board", config)

document.getElementById("white").addEventListener("click", playwhite)
document.getElementById("black").addEventListener("click", playblack)

function playwhite() {
    gameturn = 1
    nicaraoMove(gameturn,gamedepth)
    board.orientation("white")
}

function playblack() {
    gameturn = -1
    board.orientation("white")
    nicaraoMove(gameturn,gamedepth)
}

var gameturn = -1
var gamedepth = 4

function nicaraoMove(turn, depth) {
    var bestmove = nicarao(game,depth,turn)
    game.move(bestmove)
    board.position(game.fen())
    pgn.innerHTML = "PGN: " + game.pgn()
    //setTimeout(nicaraoMove,300,-turn,depth)
}
document.addEventListener("DOMContentLoaded",function(){
    if (gameturn == 1) {
        setTimeout(nicaraoMove,1000,gameturn,gamedepth)

    }
})
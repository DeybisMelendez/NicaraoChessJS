import {Chess} from "./chess.js"
import {nicarao} from "./nicarao.js"
var pgn = document.getElementById("pgn")
var game = new Chess()
var config = {
    draggable: true,
    position: game.fen(),
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
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
    nicaraoMove(1,4)
}
var board = Chessboard("board", config)

function nicaraoMove(turn, depth) {
    var bestmove = nicarao(game,depth,turn,-10000,10000, game.history({verbose:true}))
    game.move(bestmove)
    board.position(game.fen())
    pgn.innerHTML = "PGN: " + game.pgn()
    //setTimeout(nicaraoMove,300,-turn,depth)
}
document.addEventListener("DOMContentLoaded",function(){
    setTimeout(nicaraoMove,300,1,4)
})
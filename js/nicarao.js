//import {Chess} from "./chess.js"
import {PST} from "./pieceSquareTable.js"

const MVV_LVA = { //Most Valuable Victim - Least Valuable Aggressor
    k : {k:600,q:610,r:620,b:630,n:640,p:640},
    q : {k:500,q:510,r:520,b:530,n:540,p:550},
    r : {k:400,q:410,r:420,b:430,n:440,p:450},
    b : {k:300,q:310,r:320,b:330,n:340,p:350},
    n : {k:200,q:210,r:220,b:230,n:240,p:250},
    p : {k:100,q:110,r:120,b:130,n:140,p:150},
    none : {k:10,q:20,r:30,b:40,n:50,p:60}
}
const PIECE_VALUE = {p : 100,n : 320,b : 330,r : 500,q : 900}

function storeKillerMove(game, move) {
    if (move.captured == null && game.searchInfo.ply < 64) {
        var ply = game.searchInfo.ply
        game.searchInfo.killerMoves[1][ply] = game.searchInfo.killerMoves[0][ply]
        game.searchInfo.killerMoves[0][ply] = move.san
    }
}

function storeHistoryMove(game, move, color, depth) {
    if (move.captured) {
        game.searchInfo.historyMoves[color][PST.piece.indexOf(move.piece)][PST.position.indexOf(move.to)] += depth*depth
    }
}

function storePV(game, move) {
    // Triangular PV Table
    // escribe el actual pv
    var ply = game.searchInfo.ply
    game.searchInfo.pvTable[game.searchInfo.ply][game.searchInfo.ply] = move.san
    // escribimos desde la capa mas profunda hasta la actual
    for (var i=ply+1;i< game.searchInfo.pvLength[ply+1];i++) {
        game.searchInfo.pvTable[ply][i] = game.searchInfo.pvTable[ply+1][i]
    }
    // ajuste pv length
    game.searchInfo.pvLength[ply] = game.searchInfo.pvLength[ply+1]

}

function valueMove(move,searchInfo, color) {
    if (move.san.charAt(move.san.length-1) == "+" || move.san.charAt(move.san.length-1) == "#") {
        //ataque al rey
        return MVV_LVA.k[move.piece]
    } else if (move.captured != null) {
        //valora captura de piezas
        return MVV_LVA[move.captured][move.piece]
    } else {//jugadas tranquilas
        //killer move
        var km = searchInfo.killerMoves
        var ply = searchInfo.ply
        // killer moves
        if (km[0][ply] == move.san) {
            return MVV_LVA.none[move.piece] + 1000
        } else if (km[1][ply] == move.san) {
            return MVV_LVA.none[move.piece] + 900
        } else {
            // history move
            return searchInfo.historyMoves[color][PST.piece.indexOf(move.piece)][PST.position.indexOf(move.to)]
        }
        
    }
}

function sortMoves(moves, searchInfo,color) {
    moves.sort((a,b) => {
        var valueA = valueMove(a,searchInfo, color)
        var valueB = valueMove(b,searchInfo, color)
        return valueB - valueA
    })
    return moves
}

function quiesce(game, color, alpha, beta) {
    var standPat = evaluate(game) * color
    if (standPat >= beta) {
        return beta
    }
    alpha = Math.max(alpha, standPat)
    var captures = game.moves().filter(move => move.includes("x"))
    var score = -10000
    for (var i=0; i<captures.length;i++) {
        var move = captures[i]
        make(game, move,color)
        score = -quiesce(game,-color,-beta,-alpha)
        unmake(game,move,color)
        alpha = Math.max(alpha,score)
        if (score >=beta) {
            break
        }
    }
    return alpha
}

function negamax(game, depth, color, alpha, beta) {
    // Inicializa PV Length
    game.searchInfo.pvLength[game.searchInfo.ply] = game.searchInfo.ply
    if (depth == 0 || game.game_over()) {
        return evaluate(game)*color//quiesce(game,color,alpha,beta)
    }
    var moves = sortMoves(game.moves({verbose:true}), game.searchInfo, color)
    var score = -10000
    for (var i=0; i < moves.length;i++) {
        var move = moves[i]
        make(game,move,color)
        score = -negamax(game,depth-1,-color, -beta, -alpha)
        unmake(game,move,color)
        if (score > alpha) {
            //encontró un mejor movimiento
            storeHistoryMove(game,move,color, depth)
            alpha = score
            // Escribimos el PV
            storePV(game, move)
        }
        if (score >= beta) {
            // beta cut-off
            storeKillerMove(game, move)
            return beta
        }
    }
    return alpha
}

function make(game, move, color) {
    game.move(move.san)
    game.searchInfo.ply++
    game.searchInfo.material -= adjustMaterial(move,color)
    game.searchInfo.nodes++
}

function unmake(game, move,color) {
    game.searchInfo.ply--
    game.searchInfo.material += adjustMaterial(move,color)
    game.undo()
}

function evaluate(game) {
    var evaluate = 0
    evaluate += game.searchInfo.material
    evaluate += pstBonus(game)
    //evaluate += mobility(game)
    return evaluate
}

/*function mobility(game) {
    var white = new Chess(game.fen().replace(" b ", " w ")).moves().length
    var black = new Chess(game.fen().replace(" w ", " b ")).moves().length
    return (white-black) * 5
}*/

function adjustMaterial(move, color) {
    var value = 0
    if (move.captured != null) {
        value -= PIECE_VALUE[move.captured] * color
    }
    if (move.promotion != null) {
        value += (PIECE_VALUE[move.promotion] - PIECE_VALUE[move.p]) * color
    }
    return value
}

function valueMaterial(fen) {
    var material = 0
    for (var i = 0; i < fen.length; i++) {
        switch (fen[i]) {
            case "P":
                material += PIECE_VALUE.p
                break
            case "N":
                material += PIECE_VALUE.n
                break
            case "B":
                material += PIECE_VALUE.b
                break
            case "R":
                material += PIECE_VALUE.r
                break
            case "Q":
                material += PIECE_VALUE.q
                break
            case "p":
                material -= PIECE_VALUE.p
                break
            case "n":
                material -= PIECE_VALUE.n
                break
            case "b":
                material -= PIECE_VALUE.b
                break
            case "r":
                material -= PIECE_VALUE.r
                break
            case "q":
                material -= PIECE_VALUE.q
                break
            case " ":
                return material
        }
    }
}

function phaseBonus(phase, color, type, square) {
    return PST[phase][color][type][PST.position.indexOf(square)]
}

function pstBonus(game) {
    var white = 0
    var black = 0
    var pieceList = [].concat(...game.board()).filter(piece => piece != null)
    pieceList.forEach(piece => {
        if (piece.color == "w") {
            white += phaseBonus("mg",piece.color,piece.type,piece.square)
        } else {
            black += phaseBonus("mg",piece.color,piece.type,piece.square)
        }
    })
    return white - black
}

export function nicarao(game,depth,color, alpha, beta) {
    console.time("time")
    var historyMoves = new Array(12).fill().map(() => new Array(64).fill(0))
    game.searchInfo = {
        ply : 0,
        killerMoves : new Array(2).fill().map(() => new Array(64)), //2x64 bidimensional
        historyMoves : {"1":historyMoves,"-1":historyMoves.slice()}, //12x64 bidimensional
        material : valueMaterial(game.fen()),
        nodes : 0,
        //Triangular PV-Table
        pvLength : new Array(64),
        pvTable : new Array(64).fill().map(() => new Array(64)),
        followPV : 0,
        scorePV : 0
    }
    //Iterative Deepening
    for (var currentDepth=1;currentDepth <= depth;currentDepth++){
        var score = negamax(game,currentDepth,color,-beta, -alpha)
        console.log("cp:",score,
        "depth:",currentDepth,
        "nodes:", game.searchInfo.nodes,
        "pv:", game.searchInfo.pvTable[0].filter(m=> m!= null)
    )
    }/*
    var score = negamax(game,depth,color,-beta, -alpha)
    console.log("cp:",score,
        "depth:",depth,
        "nodes:", game.searchInfo.nodes,
        "pv:", game.searchInfo.pvTable[0].filter(m=> m!= null)
    )*/
    console.timeEnd("time")
    return game.searchInfo.pvTable[0][0]
}
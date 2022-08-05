//import {Chess} from "./chess.js"
import {PST} from "./pieceSquareTable.js"

// PVS ni Negascout No entiendo por qué funciona mucho mas lento y recorre mas nodos que negamax + alphabeta
// pero no lo borro por si encuentro el error mas adelante
/*
function negamaxPVS(game, depth, color, alpha, beta) {
    // Inicializa PV Length
    searchInfo.pvLength[searchInfo.ply] = searchInfo.ply
    var foundPV = false
    if (depth == 0 || game.game_over()) {
        return evaluate(game)*color//quiesce(game,color,alpha,beta)
    }
    if (searchInfo.ply > MAX_PLY-1) {
        return evaluate(game)*color
    }
    var moves = game.moves({verbose:true})
    if (searchInfo.followPV) {
        enablePVScoring(moves)
    }
    var moves = sortMoves(moves, color)
    //console.log(moves)
    var score = 0
    for (var i=0; i < moves.length;i++) {
        var move = moves[i]
        make(game,move,color)
        if (foundPV) {
            score = -negamaxPVS(game,depth-1,-color, -alpha-1, -alpha)
            if (score > alpha && score < beta) {
                score = -negamaxPVS(game,depth-1,-color, -beta, -alpha) // research
            }
        } else {
            score = -negamaxPVS(game,depth-1,-color, -beta, -alpha)
        }
        //score = -negamax(game,depth-1,-color, -beta, -alpha)
        unmake(game,move,color)
        if (score >= beta) {
            // beta cut-off
            storeKillerMove(move)
            return beta
        }
        if (score > alpha) {
            //encontró un mejor movimiento
            storeHistoryMove(game,move,color, depth)
            alpha = score
            // Escribimos el PV
            storePV(move)
            foundPV = true
        }
    }
    return alpha
}

function negascout(game, depth,color, alpha, beta) {
    // Inicializa PV Length
    searchInfo.pvLength[searchInfo.ply] = searchInfo.ply
    if (depth == 0 || game.game_over()) {
        return evaluate(game)*color//quiesce(game,color,alpha,beta)
    }
    if (searchInfo.ply > MAX_PLY-1) {
        return evaluate(game)*color
    }
    var moves = game.moves({verbose:true})
    if (searchInfo.followPV) {
        enablePVScoring(moves)
    }
    var moves = sortMoves(moves, color)
    var bestscore = -10000
    var b = beta
    for (var i=0; i < moves.length;i++) {
        var move = moves[i]
        make(game,move,color)
        var score = -negascout(game,depth-1,-color, -beta, -alpha)
        if (score > alpha && score < beta && i > 1) {
            score = -negascout(game,depth-1,-color,-beta,-score)
        }
        unmake(game,move,color)
        bestscore = Math.max(bestscore,score)
        if (bestscore > alpha) {
            //encontró un mejor movimiento
            storeHistoryMove(game,move,color, depth)
            alpha = bestscore
            // Escribimos el PV
            storePV(move)
        }
        if (alpha >= beta) {
            // beta cut-off
            storeKillerMove(move)
            return alpha
        }
        b = alpha + 1
    }
    return bestscore
}*/

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
const MAX_PLY = 64
var searchInfo = {}

function setSearchInfo(fen) {
    var historyMoves = new Array(12).fill().map(() => new Array(64).fill(0))
    var killerMoves = new Array(2).fill().map(() => new Array(MAX_PLY))
    searchInfo = {
        ply : 0,
        killerMoves : killerMoves, //2x64 bidimensional
        historyMoves : {"1":historyMoves,"-1":historyMoves.slice()}, //12x64 bidimensional
        material : valueMaterial(fen),
        nodes : 0,
        //Triangular PV-Table
        pvLength : new Array(MAX_PLY),
        pvTable : new Array(MAX_PLY).fill().map(() => new Array(MAX_PLY)),
        //Sorting PV move
        followPV : false,
        scorePV : false
    }
}

function storeKillerMove(move) {
    var ply = searchInfo.ply
    if (move.captured == null && ply < MAX_PLY) {
        searchInfo.killerMoves[1][ply] = searchInfo.killerMoves[0][ply]
        searchInfo.killerMoves[0][ply] = move.san
    }
}

function storeHistoryMove(move, color, depth) {
    if (move.captured) {
        searchInfo.historyMoves[color][PST.piece.indexOf(move.piece)][PST.position.indexOf(move.to)] += depth*depth
    }
}

function storePV(move) {
    // Triangular PV Table
    // escribe el actual pv
    var ply = searchInfo.ply
    searchInfo.pvTable[searchInfo.ply][searchInfo.ply] = move.san
    // escribimos desde la capa mas profunda hasta la actual
    for (var i=ply+1;i< searchInfo.pvLength[ply+1];i++) {
        searchInfo.pvTable[ply][i] = searchInfo.pvTable[ply+1][i]
    }
    // ajuste pv length
    searchInfo.pvLength[ply] = searchInfo.pvLength[ply+1]

}

function enablePVScoring(moves) {
    searchInfo.followPV = false
    if (moves.filter(move=>move.san == searchInfo.pvTable[0][searchInfo.ply]).length == 1) {
        searchInfo.scorePV = true
        searchInfo.followPV = true
    }
}

function valueMove(move, color) {
    //PV Move
    if (searchInfo.scorePV && searchInfo.pvTable[searchInfo.ply][searchInfo.ply] == move.san) {
        //console.log("pvmove,",move.san)
        searchInfo.scorePV = false
        //console.log("PV Move:", move.san, "ply:",searchInfo.ply)
        return 2000
    }
    //MVV-LVA
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

function sortMoves(moves,color) {
    moves.sort((a,b) => {
        var valueA = valueMove(a, color)
        var valueB = valueMove(b, color)
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
// Negamax + Alpha beta
function negamax(game, depth, color, alpha, beta) {
    // Inicializa PV Length
    searchInfo.pvLength[searchInfo.ply] = searchInfo.ply
    if (depth == 0 || game.game_over()) {
        return evaluate(game)*color//quiesce(game,color,alpha,beta)
    }
    if (searchInfo.ply > MAX_PLY-1) {
        return evaluate(game)*color
    }
    var moves = game.moves({verbose:true})
    if (searchInfo.followPV) {
        enablePVScoring(moves)
    }
    var moves = sortMoves(moves, color)
    //console.log(moves)
    var score = -10000
    for (var i=0; i < moves.length;i++) {
        var move = moves[i]
        make(game,move,color)
        score = -negamax(game,depth-1,-color, -beta, -alpha)
        unmake(game,move,color)
        if (score >= beta) {
            // beta cut-off
            storeKillerMove(move)
            return beta
        }
        if (score > alpha) {
            //encontró un mejor movimiento
            storeHistoryMove(game,move,color, depth)
            alpha = score
            // Escribimos el PV
            storePV(move)
        }
    }
    return alpha
}

function make(game, move, color) {
    game.move(move.san)
    searchInfo.ply++
    searchInfo.material -= adjustMaterial(move,color)
    searchInfo.nodes++
}

function unmake(game, move,color) {
    searchInfo.ply--
    searchInfo.material += adjustMaterial(move,color)
    game.undo()
}

function evaluate(game) {
    var evaluate = 0
    evaluate += searchInfo.material
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
    var fen = game.fen()
    setSearchInfo(fen)
    //Iterative Deepening
    var score = 0
    var bestmove = ""
    for (var currentDepth=1;currentDepth <= depth;currentDepth++){
        //searchInfo.nodes = 0
        searchInfo.followPV = true
        score = negamax(game,currentDepth,color,-beta, -alpha)
            console.log("cp:",score,
            "depth:",currentDepth,
            "nodes:", searchInfo.nodes,
            "pv:", searchInfo.pvTable[0].filter(m=> m!= null)
        )
        bestmove = searchInfo.pvTable[0][0]
        
    }
    console.timeEnd("time")
    return bestmove
}
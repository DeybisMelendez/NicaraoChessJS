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
const MAX_PLY = 64
const LMR = {fullDepthMove : 4, reductionLimit : 3}
var searchInfo = {}

function is_lmr_ok(move, incheck) {
    var isNotCapture = move.captured == null
    var isNotCheck = move.san[move.san.length-1] != "+"
    return isNotCapture && isNotCheck && !incheck
}

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
    if (move.captured != null) {
        searchInfo.historyMoves[color][PST.piece.indexOf(move.piece)][PST.position.indexOf(move.to)] += depth*depth
    }
}

function storePV(move) {
    // Triangular PV Table
    // escribe el actual pv
    var ply = searchInfo.ply
    searchInfo.pvTable[searchInfo.ply][searchInfo.ply] = move.san
    // escribimos desde la capa mas profunda hasta la actual
    for (var nextPly=ply+1;nextPly< searchInfo.pvLength[ply+1];nextPly++) {
        searchInfo.pvTable[ply][nextPly] = searchInfo.pvTable[ply+1][nextPly]
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
    // Orden
    // PV Move : 2000
    // Killer Moves : 910-1060
    // King Attacks (+,#) : 600-640
    // Piece Capture : 150-500
    // History Move : depth*depth
    // Left : 10-60

    //PV Move
    if (searchInfo.scorePV) {
        if (searchInfo.pvTable[searchInfo.ply][searchInfo.ply] == move.san) {
        searchInfo.scorePV = false
        return 2000
        }
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
            var historyMove = searchInfo.historyMoves[color][PST.piece.indexOf(move.piece)][PST.position.indexOf(move.to)]
            if (historyMove != 0) {
                return historyMove
            } else { // movimientos remanentes
                return MVV_LVA.none[move.piece]
            }
            return 
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
    var evaluation = evaluate(game) * color
    if (evaluation >= beta) {
        return beta
    }
    alpha = Math.max(alpha, evaluation)
    var captures = game.moves({verbose:true}).filter(move => move.captured != null)
    var score = -10000
    for (var i=0; i<captures.length;i++) {
        var move = captures[i]
        make(game, move, color)
        score = -quiesce(game,-color,-beta,-alpha)
        unmake(game,move,color)
        if (score >= beta) {
            return beta
        }
        alpha = Math.max(alpha,score)
    }
    //console.log(evaluation, alpha)
    return alpha
}
// Negamax + Alpha beta + LMR
function negamax(game, depth, color, alpha, beta) {
    // Inicializa PV Length
    searchInfo.pvLength[searchInfo.ply] = searchInfo.ply
    if (depth == 0 || game.game_over() || searchInfo.ply > MAX_PLY-1) {
        return quiesce(game,color,alpha,beta)
    }
    var moves = game.moves({verbose:true})
    if (searchInfo.followPV) {
        enablePVScoring(moves)
    }
    var moves = sortMoves(moves, color)
    var score = -10000
    for (var i=0; i < moves.length;i++) {
        var move = moves[i]
        make(game,move,color)
        if (i == 0 &&
            i >= LMR.fullDepthMove &&
            depth >= LMR.reductionLimit &&
            is_lmr_ok(move, game.in_check())) { //First move, use full-window search
                score = -negamax(game, depth-2,-color,-alpha-1,-alpha)
        } else { // Late Move Reduction LMR
                score = alpha + 1
        }
        //Research
        if (score > alpha) {
            score = -negamax(game,depth-1,-color, -beta, -alpha)
        }
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
            "pv:", searchInfo.pvTable[0].filter(move=>move!=null),
        )
        bestmove = searchInfo.pvTable[0][0]
        //searchInfo.pvTable = searchInfo.pvTable.map(x=>x)
        //setSearchInfo(fen)
    }
    console.timeEnd("time")
    return bestmove
}
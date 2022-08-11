//https://web.archive.org/web/20071026090003/http://www.brucemo.com/compchess/programming/index.htm
// TODO Problema con Tabla de transposicion y Aspiration Windows
// TODO Añadir Regla de tarrash para el final "torres detras de peones pasados"
import { Chess } from "./chess.js"
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
const MAX_PLY = 64
const LMR = {fullDepthMove : 3}
const NULLMOVE = {R:2}
const ASPIRATION_WINDOW = 1
const PIECE = ["wp","wn","wb","wr","wq","wk","bp","bn","bb","br","bq","bk"]
const HASH_F = {EXACT:0,ALPHA:1,BETA:2}
const MATE_SCORE = 5000

const NO_HASH_ENTRY = 100000
// 16Mb default hash table size
var hashEntries = 838860

var hashTable = new Array(hashEntries)

// clear TT (hash table)
function initHashTable() {
    // loop over TT elements
    for (var index = 0; index < hashEntries; index++) {
        // reset TT inner fields
        hashTable[index] = {
            hashKey: 0,
            depth: 0,
            flag: 0,
            score: 0,
            bestMove: 0
        }
    }
}
initHashTable()
var searchInfo = {}
// random keys
// pieceKeys es un array de cada tipo de pieza de cada color
// que contiene un array para cada casilla del tablero por cada una.
var pieceKeys = new Array(12).fill().map(() => new Array(64).fill())
// Contiene un array por cada combinación de enroques disponibles (4x4=16)
var castleKeys = new Array(16)
// un array para cada casilla del tablero para las capturas al paso.
var enpassantKeys = new Array(64)
// un numero aleatorio por el lado que juega
var sideKey = 0

var randomState = 1804289383
function random() {
    var number = randomState
    // 32-bit XOR shift
    number ^= number << 13
    number ^= number >> 17
    number ^= number << 5
    randomState = number
    return number
}
// init random hash keys
function initRandomKeys() {
    for (var i=0;i<pieceKeys.length;i++){for (var j=0;j<pieceKeys[i].length;j++){pieceKeys[i][j]=random()}}
    for (var i=0;i<castleKeys.length;i++){castleKeys[i] = random()}
    for (var i=0;i<enpassantKeys.length;i++){enpassantKeys[i] = random()}
    sideKey = random()
}
initRandomKeys()
// generate hash key
function generateHashKey(game) {
    var pieceList = [].concat(...game.board()).filter(piece => piece != null)
    var finalKey = 0
    // hash board position
    pieceList.forEach(p => {
        finalKey ^= pieceKeys[PIECE.indexOf(p.color + p.type)][PST.position.indexOf(p.square)]
    })
    // hash board state variables
    if (game.turn() == "w") {finalKey ^= sideKey}
    var fen = game.fen().split(" ")
    var isEnpassant = fen[3]
    if (isEnpassant.includes("-")) {finalKey ^= enpassantKeys[PST.position.indexOf(isEnpassant)]}
    var castle = fen[2]
    var castleID = 0
    for (var i=0; i<castle.length;i++) {
        switch (castle[i]) {
            case "K": {castleID += 1}
            case "Q": {castleID += 2}
            case "k": {castleID += 4}
            case "q": {castleID += 8}
            case "-": break
        }
    }
    if (castleID != 0 || castle == "-") {
        finalKey ^= castleKeys[castleID]
    }
    return finalKey;
}

function readHashEntry(hashKey,alpha,beta,depth) {
    var hashEntry = hashTable[(hashKey & 0x7fffffff) % hashEntries]
    // match hash key
    if (hashEntry.hashKey == hashKey) {
        if (hashEntry.depth >= depth) {
            if (score < -searchInfo.mate) score += searchInfo.ply
            if (score > searchInfo.mate) score -= searchInfo.ply
            // init score
            var score = hashEntry.score
            // match hash flag
            if (hashEntry.flag == HASH_F.EXACT) return score
            if (hashEntry.flag == HASH_F.ALPHA && (score <= alpha)) return alpha
            if (hashEntry.flag == HASH_F.BETA && (score >= beta)) return beta
        }
    }
    // if hash entry doesn't exist
    return NO_HASH_ENTRY
}

function writeHashEntry(hashKey,score, depth, flag) {
    if (score < -searchInfo.mate) score -= searchInfo.ply
    if (score > searchInfo.mate) score += searchInfo.ply
    // init hash entry
    var hashEntry = hashTable[(hashKey & 0x7fffffff) % hashEntries]
    hashEntry.hashKey = hashKey
    hashEntry.score = score
    hashEntry.flag = flag
    hashEntry.depth = depth
}

function is_lmr_ok(move, inCheck) {
    var isNotCapture = move.captured == null
    return isNotCapture && !inCheck
}

function setSearchInfo(fen) {
    var historyMoves = new Array(12).fill().map(() => new Array(64).fill(0))
    var killerMoves = new Array(2).fill().map(() => new Array(MAX_PLY))
    searchInfo = {
        ply : 0,
        killerMoves : killerMoves, //2x64 bidimensional
        historyMoves : {"1":historyMoves,"-1":historyMoves.slice()}, //12x64 bidimensional
        materialMG : 0,
        materialEG : 0,
        nodes : 0,
        //Triangular PV-Table
        pvLength : new Array(MAX_PLY),
        pvTable : new Array(MAX_PLY).fill().map(() => new Array(MAX_PLY)),
        //Sorting PV move
        followPV : false,
        scorePV : false,
        phase : "",
        mate : MATE_SCORE
    }
    valueMaterial(fen)
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

function nullMove(inCheck,depth, fen, color, beta) { // TODO
    if (depth>= NULLMOVE.R+1 && !inCheck && searchInfo.ply > 0) {
        if (color == -1) {
            fen = fen.replace(" b ", " w ")
        } else {
            fen = fen.replace(" w ", " b ")
        }
        var copyBoard = new Chess(fen)
        var score = -negamax(copyBoard,depth-1-NULLMOVE.R,-color,-beta,-beta+1)
        if (score >= beta) {
            return beta
        }
    }
    return null
}

function valueMove(move, color) {
    // Orden
    // Mate : 5000
    // PV Move : 2000
    // Killer Moves : 910-1060
    // King Attacks (+,#) : 600-640
    // Piece Capture : 150-500
    // History Move : depth*depth
    // Left : 10-60
    if (move.san.includes("#")) {
        return MATE_SCORE
    }
    //PV Move
    if (searchInfo.scorePV) {
        if (searchInfo.pvTable[searchInfo.ply][searchInfo.ply] == move.san) {
        searchInfo.scorePV = false
        return 2000
        }
    }
    //MVV-LVA
    if (move.san.charAt(move.san.length-1) == "+") {
        //ataque al rey
        return MVV_LVA.k[move.piece]
    } else if (move.captured != null) {
        //valora captura de piezas
        return MVV_LVA[move.captured][move.piece]
    } else {//jugadas tranquilas Quiescence
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
    var standPat = evaluate(game, color)
    if (standPat >= beta) {
        return beta
    }
    alpha = Math.max(alpha, standPat)
    var captures = game.moves({verbose:true, legal:true}).filter(move => move.captured != null)
    captures.sort((a,b) => MVV_LVA[b.captured][b.piece] - MVV_LVA[a.captured][a.piece])
    var score = 0
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
    return alpha
}
// Negamax + Alpha beta + LMR
function negamax(game, depth, color, alpha, beta) {
    // Inicializa PV Length
    searchInfo.pvLength[searchInfo.ply] = searchInfo.ply
    var hashFlag = HASH_F.ALPHA
    var score = readHashEntry(generateHashKey(game),alpha,beta,depth)
    if (score != NO_HASH_ENTRY && searchInfo.ply >0) {
        return score
    }
    if (depth == 0 || game.game_over() || searchInfo.ply > MAX_PLY-1) {
        var val = quiesce(game,color,alpha,beta)
        //var val = evaluate(game,color)
        //writeHashEntry(generateHashKey(game),val,depth,HASH_F.EXACT)
        return val
    }
    var moves = game.moves({verbose:true, legal:true})//.filter(move => move.captured != "k")
    if (searchInfo.followPV) {
        enablePVScoring(moves)
    }
    var moves = sortMoves(moves, color)
    //Null Move No funciona correctamente, no permite encontrar jaque mate
    var nullScore = nullMove(game.in_check(),depth,game.fen(),color,beta)
    if (nullScore != null) {
        //probando
        return beta
    }
    //var movesSearched = 0
    for (var i=0; i < moves.length;i++) {
        var move = moves[i]
        make(game,move,color)
        // Late Move Reduction LMR
        var PVReduction = Math.floor(depth*0.6666666667)
        var nonPVReduction = depth-1
        if (i >= LMR.fullDepthMove && is_lmr_ok(move, game.in_check())) {
            score = -negamax(game,PVReduction,-color,-alpha-1,-alpha)
            if (score > alpha && score < beta) {
                //https://www.chessprogramming.org/NegaScout#Guido_Schimmels
                var score2 = -negamax(game,nonPVReduction,-color, -beta, -alpha)
                score = Math.max(score,score2)
            }
        } else {
            //Principal Variation Search Negamax
            score = -negamax(game,nonPVReduction,-color, -beta, -alpha)
        }
        //movesSearched++ 
        unmake(game,move,color)
        if (score > alpha) {
            //encontró un mejor movimiento
            storeHistoryMove(game,move,color, depth)
            alpha = score
            // Escribimos el PV
            hashFlag = HASH_F.EXACT
            storePV(move)
        }
        if (score >= beta) {
            // beta cut-off
            storeKillerMove(move)
            writeHashEntry(generateHashKey(game),beta,depth,HASH_F.BETA)
            return beta
        }
    }
    //Mate Score
    //searchInfo.mate--
    writeHashEntry(generateHashKey(game),alpha,depth,hashFlag)
    return alpha
}

function make(game, move, color) {
    game.move(move.san)
    searchInfo.ply++
    adjustMaterial(move,color, true)
    searchInfo.nodes++
}

function unmake(game, move,color) {
    searchInfo.ply--
    adjustMaterial(move,color, false)
    game.undo()
}

function evaluate(game, color) {
    if (game.game_over()) {
        if (game.in_checkmate()) {
            return -searchInfo.mate + searchInfo.ply
        }
    }
    var evaluate = 0
    var pieceList = [].concat(...game.board()).filter(piece => piece != null)
    var pawns = pieceList.filter(x=>x.type == "p")
    // Game Phase
    var phase = "mg"
    var minorPieces = pieceList.filter(piece => piece.type == "n" || piece.type == "b" || piece.type == "r")
    var queens = pieceList.filter(piece => piece.type == "q")
    if (queens.length == 0 || minorPieces.length <= 4 && queens.length > 0) {
        phase = "eg"
        evaluate += searchInfo.materialEG
    } else {
        evaluate += searchInfo.materialMG
        evaluate += centerControl(pawns)
    }
    evaluate += pst(phase, pieceList)
    evaluate += piecesEvaluation(pieceList, pawns)
    searchInfo.phase = phase
    return evaluate * color
}

function adjustMaterial(move, color, add) {
    if (move.captured != null && move.captured != "k") {
        if (add) {
            searchInfo.materialMG += PST.pieceValueMG[move.captured] * color
            searchInfo.materialEG += PST.pieceValueEG[move.captured] * color
        } else {
            searchInfo.materialMG -= PST.pieceValueMG[move.captured] * color
            searchInfo.materialEG -= PST.pieceValueEG[move.captured] * color
        }
    }
    if (move.promotion != null) {
        if (add) {
            searchInfo.materialEG += (PST.pieceValueEG[move.promotion] - PST.pieceValueEG.p) * color
            searchInfo.materialMG += (PST.pieceValueMG[move.promotion] - PST.pieceValueMG.p) * color
        } else {
            searchInfo.materialEG -= (PST.pieceValueEG[move.promotion] - PST.pieceValueEG.p) * color
            searchInfo.materialMG -= (PST.pieceValueMG[move.promotion] - PST.pieceValueMG.p) * color
        }
    }
}

function valueMaterial(fen) {
    searchInfo.materialEG = 0
    searchInfo.materialMG = 0
    for (var i = 0; i < fen.length; i++) {
        switch (fen[i]) {
            case "P":
                searchInfo.materialMG += PST.pieceValueMG.p
                searchInfo.materialEG += PST.pieceValueEG.p
                break
            case "N":
                searchInfo.materialMG += PST.pieceValueMG.n
                searchInfo.materialEG += PST.pieceValueEG.n
                break
            case "B":
                searchInfo.materialMG += PST.pieceValueMG.b
                searchInfo.materialEG += PST.pieceValueEG.b
                break
            case "R":
                searchInfo.materialMG += PST.pieceValueMG.r
                searchInfo.materialEG += PST.pieceValueEG.r
                break
            case "Q":
                searchInfo.materialMG += PST.pieceValueMG.q
                searchInfo.materialEG += PST.pieceValueEG.q
                break
            case "p":
                searchInfo.materialMG -= PST.pieceValueMG.p
                searchInfo.materialEG -= PST.pieceValueEG.p
                break
            case "n":
                searchInfo.materialMG -= PST.pieceValueMG.n
                searchInfo.materialEG -= PST.pieceValueEG.n
                break
            case "b":
                searchInfo.materialMG -= PST.pieceValueMG.b
                searchInfo.materialEG -= PST.pieceValueEG.b
                break
            case "r":
                searchInfo.materialMG -= PST.pieceValueMG.r
                searchInfo.materialEG -= PST.pieceValueEG.r
                break
            case "q":
                searchInfo.materialMG -= PST.pieceValueMG.q
                searchInfo.materialEG -= PST.pieceValueEG.q
                break
            case " ":
                return
        }
    }
}

function phaseBonus(phase, color, type, square) {
    return PST[phase][color][type][PST.position.indexOf(square)]
}

function pst(phase, pieceList) {
    var white = 0
    var black = 0
    pieceList.forEach(piece => {
        if (piece.color == "w") {
            white += phaseBonus(phase,piece.color,piece.type,piece.square)
        } else {
            black += phaseBonus(phase,piece.color,piece.type,piece.square)
        }
    })
    return white - black
}

function centerControl(pawns) {
    var white = 0, black = 0
    pawns.forEach(pawn => {
        if (PST.center.includes(pawn.square)) {
            if (pawn.color == "w") {
                white += 10
            } else {
                black += 10
            }  
        } else if (PST.extendedCenter.includes(pawn.square)) {
            if (pawn.color == "w") {
                white += 5
            } else {
                black += 5
            }  
        }
    })
    return white - black
}

function piecesEvaluation(pieceList,pawns) {
    var white = 0,black = 0
    var whiteBishops = pieceList.filter(x=>x.type=="b"&&x.color=="w")
    var whiteKnights = pieceList.filter(x=>x.type=="n"&&x.color=="w")
    var whiteRooks = pieceList.filter(x=>x.type=="r"&&x.color=="w")
    var blackKnights = pieceList.filter(x=>x.type=="n"&&x.color=="b")
    var blackBishops = pieceList.filter(x=>x.type=="b"&&x.color=="b")
    var blackRooks = pieceList.filter(x=>x.type=="r"&&x.color=="b")
    // Penalización por mal caballo (menos peones menos valor)
    var pawnBonus = 80 - (pawns.length * 5)
    if (whiteKnights.length > 0) {
        white -= pawnBonus
    }
    if (blackKnights.length > 0) {
        black -= pawnBonus
    }
    // Bonificación por pareja de alfiles
    if (whiteBishops.length>1){
        white += 50
    }
    if (blackBishops.length>1) {
        black += 50
    }
    // Penalización por mal alfil
    var bishops = whiteBishops.concat(blackBishops)
    bishops.forEach(bishop => {
        var col = (PST.cols.indexOf(bishop.square[0])+1)%2 == 0
        var file = (Number(bishop.square[1]))%2 == 0
        var color = "w"
        if (col==0 && file==0 || col!=0 && file!=0) {
            color = "b"
        }
        var pawnsOnColor = pieceList.filter(x=>{
            var pawnCol = (PST.cols.indexOf(x.square[0])+1)%2 == 0
            var pawnFile = (Number(x.square[1]))%2 == 0
            var pawnColor = "w"
            if (pawnCol==0 && pawnFile==0 || pawnCol!=0 && pawnFile!=0) {
                pawnColor = "b"
            }
            return x.color == bishop.color && color == pawnColor
        })
        if (pawnsOnColor.length > 3) {
            if (bishop.color == "w") {
                white -= 50
            } else {
                black -= 50
            }
        }
    })
    // Bonificación por buena torre (menos peones mas valor) 5x16=80
    if (whiteRooks.length > 0) {
        white += pawnBonus
    }
    if (blackRooks.length > 0) {
        black += pawnBonus
    }
    // Bonificación por torre en columna abierta
    var rooks = whiteRooks.concat(blackRooks)
    if (pawns.length > 8) { // solo si hay mas de 8 peones
        rooks.forEach(rook => {
            var pawnsOnFile = pawns.filter(x=>x.square.includes(rook.square[0]))
            if (pawnsOnFile.length==0) {
                if (rook.color == "w") {
                    white += 20
                } else {
                    black += 20
                }
            }
        })
    }
    // Bonificación por torre atacando dama (incluso con rayos X)
    rooks.forEach(rook => {
        var queens = pieceList.filter(x=>x.type == "q" && x.color =="w")
        queens.forEach(queen => {
            if (queen.square.includes(rook.square[0]) && queen.color != rook.color) {
                if (rook.color == "w") {
                    white += 10
                } else {
                    black += 10
                }
            }
        })
    })
    // Penalización por peón doblado 5 por peon, ej: 2 peones en una columna = 10, 3 peones = 15,etc.
    pawns.forEach(pawn => {
        var doubled = pawns.filter(x=>x.color == pawn.color && x.square.includes(pawn.square[0])).length
        if (doubled > 0) {
            if (pawn.color == "w") {
                white -= 5
            } else {
                black -= 5
            }
        }
    })
    return white - black
}

export function nicarao(game,timeleft,color) {
    console.time("time")
    var fen = game.fen()
    setSearchInfo(fen)
    initHashTable()
    //Iterative Deepening + Aspiration Windows
    var score = 0
    var bestmove = ""
    var infinity = 10000
    var alpha = -infinity
    var beta = infinity
    var firstTime = new Date().getTime()
    for (var currentDepth=1;true;currentDepth++){
        var actualTime = new Date().getTime()
        if (actualTime - firstTime >= timeleft) {
            break
        }
        // break si encuentra jaque mate forzado
        if (searchInfo.pvTable[0].filter(x=>x.includes("#")).length > 0) {
            break
        }
        valueMaterial(fen)
        searchInfo.followPV = true
        searchInfo.mate = MATE_SCORE
        score = negamax(game,currentDepth,color,alpha, beta)
        // ASPIRATION WINDOWS Revisar por qué omite jugadas de jaque mate en tacticas
        /*if (score <= alpha || score >= beta) {
            alpha = -infinity
            beta = infinity
        }
        alpha = score - ASPIRATION_WINDOW
        beta = score + ASPIRATION_WINDOW*/
        console.log("cp:",score,
            "depth:",currentDepth,
            "nodes:", searchInfo.nodes,
            "material:", searchInfo.materialMG,searchInfo.materialEG,
            "phase", searchInfo.phase,
            "pv:", searchInfo.pvTable[0].filter(move=>move!=null),
        )
        bestmove = searchInfo.pvTable[0][0]
        if (score >= MATE_SCORE - 1000) {
            console.log("Mate in",Math.floor((MATE_SCORE - score+1)/2))
        } else if(score <= - MATE_SCORE + 1000) {
            console.log("Mated in",Math.floor((MATE_SCORE + score)/2))
        }
    }
    console.timeEnd("time")
    return bestmove
}
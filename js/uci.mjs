#!/usr/bin/env node --experimental-nodes
// Thank you: https://github.com/maksimKorzh/wukongJS/blob/main/wukong.js

import {Chess} from "./chess.mjs"
import { Nicarao, SetHashSize} from "./nicarao.mjs"
import readline from "readline"

process.stdin.setEncoding('utf-8')
var game = new Chess()
const white = "w"
const black = "b"

// parse UCI "go" command
function parseGo(command) {
    if (command.includes('infinite')) return

    let time = -1
    let stopTime = -1
    let go = command.split(' ')
    let depth = -1
    let movestogo = 30
    let movetime = -1
    let inc = 0

    if (go[1] == 'wtime' && game.turn() == white ) { time = parseInt(go[2])}
    if (go[3] == 'btime' && game.turn() == black ) { time = parseInt(go[4])}
    if (go[5] == 'winc' && game.turn() == white) { inc = parseInt(go[6])}
    if (go[7] == 'binc' && game.turn() == black) { inc = parseInt(go[8])}
    if (go[9] == 'movestogo') { movestogo = parseInt(go[10])}
    if (go[1] == 'movetime') { movetime = parseInt(go[2])}
    if (go[1] == 'depth') { depth = parseInt(go[2])}
    let startTime = Date.now()
    if(movetime != -1) {
        movestogo = 1
    }
    
    if(time != -1) {
        let timeTotal = time - 50
        let moveTime = parseInt(timeTotal / movestogo + inc)
        if (inc > 0 && timeTotal < 5 * inc) moveTime = parseInt(75 * inc / 100)
        stopTime = startTime + moveTime
    }

    // "infinite" depth if it's not specified
    //if (depth == -1) depth = 64

    console.log(
        'time:', time,
        'inc', inc,
        'start', startTime,
        'stop', stopTime,
        'depth', depth,
    )
    // search position console.log() es necesario
    let bestmove = Nicarao(game,stopTime,depth)
    let toprint = "bestmove " + bestmove.from+bestmove.to
    if (bestmove.promotion!= null) {
        toprint += bestmove.promotion
    }
    console.log(toprint)
}

// parse UCI "position" command
function parsePosition(command) {
    let position = command.split(' ')
    
    if (position[1].includes('startpos')) game = new Chess()
    else if (position[1] == 'fen') game = new Chess(command.split('position fen ')[1])
    
    let moves = command.split('moves ')[1];
    if (moves) {
        moves = moves.split(' ')
        moves.forEach(move => {
            game.move(move,{sloppy:true})
        })
    }
    console.log(game.ascii())
}

// create CLI interface

var uci = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
})

// UCI loop
uci.on('line', function(command){
    if (command == 'uci') {
        console.log('id name NicaraoChessJS ')
        console.log('id author Deybis Melendez')
        console.log('option name Hash type spin default 16 min 4 max 128')
        console.log('uciok')
    }

    if (command == 'isready') console.log('readyok')
    if (command == 'quit') process.exit()
    if (command == 'ucinewgame') parsePosition("position startpos")
    if (command.includes('position')) parsePosition(command)
    if (command.includes('go')) parseGo(command)

    // set hash size
    if (command.includes("setoption name Hash value")) {
        let Mb = command.split(' ')[command.split(' ').length - 1]
        SetHashSize(Mb)
    }
})
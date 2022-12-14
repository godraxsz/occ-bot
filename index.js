const wppconnect = require('@wppconnect-team/wppconnect');
const db = require('./helpers/mysql');
const receitaws = require('receitaws');
const express = require('express');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fileUpload = require('express-fileupload');
const port = 8000;
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
//const mime = require('mime-types');
//const fs = require('fs');
//const { QuickDB } = require('quick.db');
//const quickDB = new QuickDB();
//const Stopwatch = require("timer-stopwatch");
//const moment = require('moment-timezone');
//const Timeout = require('timeout-refresh');

const { atualizarTempo, regexForaExpediente, validarCNPJ, delay, fila, filaservico, filaplano } = require('./util/util');
const { resposta01, resposta03, resposta02, resposta04, resposta05, resposta07, resposta08, resposta14, resposta06, primeiraVez, cnpjSim, cnpjIncorreto, modeloTermo, limiteFaturamentoValorBruto, limiteFaturamento, emancipacao, valorBruto, faturamentoJaneiro, faturamentoFevereiro, faturamentoMarco, faturamentoAbril, faturamentoMaio, faturamentoJunho, faturamentoJulho, faturamentoAgosto, faturamentoSetembro, faturamentoOutubro, faturamentoNovembro, faturamentoDezembro, faturamentoPadrao, resposta09, resposta10, modeloRelatorioReceitasBrutas, resposta11, resposta12, limiteUltrapassado, cadastroErro, corrigirCadastro, resposta13, cnpjCCMEI, diferencaPJPF, condicoesFuncionarios, filialNoMEI, licitacoes, consultaPrevia, habiteSe, naturezaJuridica, respostaFaturamento, mensagemInicial, respostaChatAtendente, perguntarNome, confirmarNome, corrigirNome, nomeNaoConfirmado, nomeInvalido, meiNaoConfirmado, respostaLigarRamal, resposta15, modeloRelatorioReceitasBrutasSebrae, modeloContasPagar, modeloContasReceber, resposta16, declaracaoAnual, dicasControleMensal, mesNaoInformado, mensagemInicialCadastro, perguntarNomeRecuperacao, perguntarMeiRecuperacao, formalizacaoNaoConfirmado, verificarPlano, filaDeAtendimento, cancelarAtendimento, resposta18, contratarPlano, mandarFilaBot, planosMensais, servicosAvulsos, contratarServico } = require('./flow/respostas');
const { painelQRCODE, painelStatus, painelState, painelStream } = require('./util/panel');
const { tempoBot } = require('./util/config');
const { faturamento1, faturamento2 } = require('./flow/perguntas');

/// ?????? CONFIG PAINEL (EXPRESS)
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
app.use(fileUpload({
    debug: false
}));
app.use("/", express.static(__dirname + "/"))

app.get('/', (req, res) => {
    res.sendFile('index.html', {
        root: __dirname
    });
});

/// ?????? CONFIG TIMEOUT CONSULTA DO RECEITAWS
const opt = {
    timeout: 10000
}
const instance = receitaws(opt)

/// ?????? CONFIG INICIAR NOVA SESS??O DO BOT
wppconnect.create({
    session: 'OCC_MEI', // Nome do client
    catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
        console.log('???? QR Code N??: ', attempts);
        console.log('???? Console QR Code:\n', asciiQR);
        painelQRCODE(urlCode, io, qrcode);
        //console.log('base64 image string qrcode: ', base64Qrimg);
        //console.log('urlCode (data-ref): ', urlCode);
    },
    statusFind: (statusSession, session) => {
        console.log('???? Sess??o: ', session);
        console.log('???? Status: ', statusSession); // return isLogged || notLogged || browserClose || qrReadSuccess || qrReadFail || autocloseCalled || desconnectedMobile || deleteToken || inChat
        db.setStatusBot(statusSession);
        painelStatus(statusSession, io);
        //Create session wss return "serverClose" case server for close
    },
    headless: true, // Headless chrome
    devtools: false, // Open devtools by default
    useChrome: true, // If false will use Chromium instance
    debug: false, // Opens a debug session
    logQR: true, // Logs QR automatically in terminal
    browserWS: '', // If u want to use browserWSEndpoint
    browserArgs: [''], // Parameters to be added into the chrome browser instance
    puppeteerOptions: {}, // Will be passed to puppeteer.launch
    disableWelcome: true, // Option to disable the welcoming message which appears in the beginning
    updatesLog: true, // Logs info updates automatically in terminal
    autoClose: 0, // Automatically closes the wppconnect only when scanning the QR code (default 60 seconds, if you want to turn it off, assign 0 or false)
    tokenStore: 'file', // Define how work with tokens, that can be a custom interface
    folderNameToken: './tokens', //folder name when saving tokens
    // BrowserSessionToken
    // To receive the client's token use the function await client.getSessionTokenBrowser()
    sessionToken: {
        WABrowserId: '"UnXjH....."',
        WASecretBundle: '{"key":"+i/nRgWJ....","encKey":"kGdMR5t....","macKey":"+i/nRgW...."}',
        WAToken1: '"0i8...."',
        WAToken2: '"1@lPpzwC...."',
    }
}).then((client) => start(client)).catch((error) => console.log(error));

// ?????? EXECUTAR AO CARREGAR PAINEL
io.on('connection', async function (socket) {
    const getStatusBot = await db.getStatusBot();
    socket.emit('message', `???? [PAINEL] Iniciando`);
    socket.emit('qr', './panel/icons/foguete.gif');
    setTimeout(() => painelStatus(getStatusBot, socket), 1000);
});

// ?????? EXECUTAR AO INICIAR O BOT
function start(client) {

    client.sendText('120363026676372633@g.us', `????????\nO BOT foi *reiniciado*.\nTodas as filas est??o *vazias*.`)
    client.sendText('120363025860174520@g.us', `????????\nO BOT foi *reiniciado*.\nTodas as filas est??o *vazias*.`)
    client.sendText('120363043600410941@g.us', `????????\nO BOT foi *reiniciado*.\nTodas as filas est??o *vazias*.`)

    /// RESETAR STATUS DO AUTOATENDIMENTO
    async function resetarAutoatendimento() {
        await db.resetStatus();
        await db.resetStatusCadastro();
        await db.resetStatusMei();
    }

    resetarAutoatendimento();

    // DETECTAR CONFLITOS E ALTERAR STATES
    // FOR??AR MANTER A SESS??O ATUAL

    // STATES:
    // CONFLICT | CONNECTED | DEPRECATED_VERSION | OPENING | PAIRING | PROXYBLOCK | SMB_TOS_BLOCK | TIMEOUT | TOS_BLOCK | UNLAUNCHED | UNPAIRED | UNPAIRED_IDLE

    client.onStateChange((state) => {
        console.log('???? Status do BOT: ', state);
        // for??ar o whatsapp a assumir sess??o
        if (state === 'CONFLICT') { client.useHere() };
        // detecta quando o Whatsapp ?? desconectado
        if (state === 'UNPAIRED') { console.log('DESLOGADO') };
        painelState(state, io);
    });

    // STREAM:
    // DISCONNECTED | SYNCING | RESUMING | CONNECTED

    let time = 0;
    client.onStreamChange((state) => {
        console.log('???? Conex??o: ' + state);
        clearTimeout(time);
        if (state === 'DISCONNECTED' || state === 'SYNCING') {
            time = setTimeout(() => {
                client.close();
            }, 80000);
        }
        painelStream(state, io);
    });


    // DETECTAR LIGA????ES E RESPONDER
    client.onIncomingCall(async (call) => {
        //console.log(call);
        client.rejectCall();
        client.sendText(call.peerJid, "*?????? ???????????????????????????????? ????????????????*\n\nDesculpe, mas n??o atendemos liga????es por Whatsapp.\n\nEntre em contato conosco via telefone:\n*(11) 2984-3950 | Ramal 7279 - Matheus*");
    });

    client.onAnyMessage(async (message) => {

        const getUserNameConsultoria = await db.getNome(String(fila.elements[0]));
        const getUserNameContratarServico = await db.getNome(String(filaservico.elements[0]));
        const getUserNameContratarPlano = await db.getNome(String(filaplano.elements[0]));
        const keywordCustom = String(message.body).toLowerCase();
        const userto = message.to.replace(/\D/g, '');

        const getUserStatusCustom = await db.getStatus(userto);


        if (message.isGroupMsg === false) {
            if (message.from === '5511915842084@c.us') {

                if (getUserStatusCustom === 'on') {
                    await db.setStatusOff(userto)
                    delay(tempoBot).then(async function () {
                        await db.setStatusOn(userto);
                    });
                }

                if (keywordCustom.startsWith('atendimento encerrado')) {
                    await db.setStatusOff(userto)
                        .then(() => client.sendText(message.to, 'Escreva *"Atendimento"* para utilizar nosso ???????????????????????????????????????????????????????????? ???????????? novamente.'))
                }
            }
        }

        //if (message.from === '120363026676372633@g.us')
        if (message.isGroupMsg === true) {
            if (message.from === '5511915842084@c.us') {

                if (keywordCustom.startsWith(`/cadastrar`)) {
                    if (message.to === '120363025241819134@g.us') {
                        let dadosCadastro = String(message.body).substring(11)
                        let numeroUsuario = dadosCadastro.replace(/[^\d]/g, '');
                        let nomeUsuario = dadosCadastro.replace(/[^A-Za-z?????????????????????????????????????????????????????????????? ]/g, '');
                        nomeUsuario = nomeUsuario.substring(1)

                        if (numeroUsuario.length >= 10) {

                            if (nomeUsuario.length >= 3) {

                                if (!numeroUsuario.startsWith('55')) {
                                    numeroUsuario = '55' + numeroUsuario;
                                    let checarNumero = await db.getNome(numeroUsuario);
                                    if (checarNumero === false) {
                                        await db.setUserComando(numeroUsuario, nomeUsuario);
                                        client.sendText('120363025241819134@g.us', `*Usu??rio cadastrado!*\n\nN??mero: ${numeroUsuario}\nNome: ${nomeUsuario}`);
                                    } else if (checarNumero !== false) {
                                        client.sendText('120363025241819134@g.us', `O usu??rio que voc?? est?? tentando cadastrar j?? est?? registrado.\n\nVerifique e tente novamente.`);
                                    }
                                } else if (numeroUsuario.startsWith('55')) {
                                    let checarNumero = await db.getNome(numeroUsuario);
                                    if (checarNumero === false) {
                                        await db.setUserComando(numeroUsuario, nomeUsuario);
                                        client.sendText('120363025241819134@g.us', `*Usu??rio cadastrado!*\n\nN??mero: ${numeroUsuario}\nNome: ${nomeUsuario}`);
                                    } else if (checarNumero !== false) {
                                        client.sendText('120363025241819134@g.us', `O usu??rio que voc?? est?? tentando cadastrar j?? est?? registrado.\n\nVerifique e tente novamente.`);
                                    }
                                } else {
                                    client.sendText('120363025241819134@g.us', `Algo deu errado.\n\nVerifique e tente novamente.`);
                                }

                            } else if (nomeUsuario.length < 3) {
                                client.sendText('120363025241819134@g.us', `O nome ?? inv??lido ou n??o foi informado.\n\nVerifique e tente novamente.`);
                            }

                        } else if (numeroUsuario.length < 10) {
                            client.sendText('120363025241819134@g.us', `O n??mero ?? inv??lido ou n??o foi informado.\n\nVerifique e tente novamente.`);
                        }
                    }
                }

                if (keywordCustom.startsWith('/plano bronze')) {
                    if (message.to === '120363025241819134@g.us') {
                        let usuarioBronze = keywordCustom.replace(/[^\d]/g, '');
                        if (!usuarioBronze.startsWith('55')) {
                            usuarioBronze = '55' + usuarioBronze;
                            let pegarNome = await db.getNome(usuarioBronze)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                await db.setPlanoBronze(usuarioBronze)
                                    .then(() => client.sendText('120363025241819134@g.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioBronze})_\n*Plano:* Bronze\n\nAgora ele possui *1* consultoria/m??s.`)
                                        .then(() => client.sendText(usuarioBronze + '@c.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Parab??ns!*\nO seu plano foi atualizado para: *Bronze*\n\nAgora voc?? possui *1* consultoria/m??s entre outras vantagens! ????\n\nObrigado por escolher a *OCC* ????`))
                                    )
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        } else if (usuarioBronze.startsWith('55')) {
                            let pegarNome = await db.getNome(usuarioBronze)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                await db.setPlanoBronze(usuarioBronze)
                                    .then(() => client.sendText('120363025241819134@g.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioBronze})_\n*Plano:* Bronze\n\nAgora ele possui *1* consultoria/m??s.`)
                                        .then(() => client.sendText(usuarioBronze + '@c.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Parab??ns!*\nO seu plano foi atualizado para: *Bronze*\n\nAgora voc?? possui *1* consultoria/m??s entre outras vantagens! ????\n\nObrigado por escolher a *OCC* ????`))
                                    )
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        }
                    }
                }

                if (keywordCustom.startsWith('/plano prata')) {
                    if (message.to === '120363025241819134@g.us') {
                        let usuarioPrata = keywordCustom.replace(/[^\d]/g, '');
                        if (!usuarioPrata.startsWith('55')) {
                            usuarioPrata = '55' + usuarioPrata;
                            let pegarNome = await db.getNome(usuarioPrata)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                await db.setPlanoPrata(usuarioPrata)
                                    .then(() => client.sendText('120363025241819134@g.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioPrata})_\n*Plano:* Prata\n\nAgora ele possui *3* consultorias/m??s.`)
                                        .then(() => client.sendText(usuarioPrata + '@c.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Parab??ns!*\nO seu plano foi atualizado para: *Prata*\n\nAgora voc?? possui *3* consultorias/m??s entre outras vantagens! ????\n\nObrigado por escolher a *OCC* ????`))
                                    )
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        } else if (usuarioPrata.startsWith('55')) {
                            let pegarNome = await db.getNome(usuarioPrata)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                await db.setPlanoPrata(usuarioPrata)
                                    .then(() => client.sendText('120363025241819134@g.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioPrata})_\n*Plano:* Prata\n\nAgora ele possui *3* consultorias/m??s.`)
                                        .then(() => client.sendText(usuarioPrata + '@c.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Parab??ns!*\nO seu plano foi atualizado para: *Prata*\n\nAgora voc?? possui *3* consultorias/m??s entre outras vantagens! ????\n\nObrigado por escolher a *OCC* ????`))
                                    )
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        }
                    }
                }

                if (keywordCustom.startsWith('/plano ouro')) {
                    if (message.to === '120363025241819134@g.us') {
                        let usuarioOuro = keywordCustom.replace(/[^\d]/g, '');
                        if (!usuarioOuro.startsWith('55')) {
                            usuarioOuro = '55' + usuarioOuro;
                            let pegarNome = await db.getNome(usuarioOuro)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                await db.setPlanoOuro(usuarioOuro)
                                    .then(() => client.sendText('120363025241819134@g.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioOuro})_\n*Plano:* Ouro\n\nAgora ele possui *5* consultorias/m??s.`)
                                        .then(() => client.sendText(usuarioOuro + '@c.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Parab??ns!*\nO seu plano foi atualizado para: *Ouro*\n\nAgora voc?? possui *5* consultorias/m??s entre outras vantagens! ????\n\nObrigado por escolher a *OCC* ????`))
                                    )
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        } else if (usuarioOuro.startsWith('55')) {
                            let pegarNome = await db.getNome(usuarioOuro)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                await db.setPlanoOuro(usuarioOuro)
                                    .then(() => client.sendText('120363025241819134@g.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioOuro})_\n*Plano:* Ouro\n\nAgora ele possui *5* consultorias/m??s.`)
                                        .then(() => client.sendText(usuarioOuro + '@c.us', `*?????? ???????????????????? ????????????????????????????????????????*\n\n*Parab??ns!*\nO seu plano foi atualizado para: *Ouro*\n\nAgora voc?? possui *5* consultorias/m??s entre outras vantagens! ????\n\nObrigado por escolher a *OCC* ????`))
                                    )
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        }
                    }
                }

                if (keywordCustom.startsWith('/plano remover')) {
                    if (message.to === '120363025241819134@g.us') {
                        let usuarioRemover = keywordCustom.replace(/[^\d]/g, '');
                        if (!usuarioRemover.startsWith('55')) {
                            usuarioRemover = '55' + usuarioRemover;
                            let pegarNome = await db.getNome(usuarioRemover)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                await db.setPlanoRemover(usuarioRemover)
                                    .then(() => client.sendText('120363025241819134@g.us', `*?????? ???????????????????? ????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioRemover})_\n*Plano:* Sem plano cadastrado.\n\nAgora ele n??o possui mais consultorias.`)
                                    )
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        } else if (usuarioRemover.startsWith('55')) {
                            let pegarNome = await db.getNome(usuarioRemover)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                await db.setPlanoRemover(usuarioRemover)
                                    .then(() => client.sendText('120363025241819134@g.us', `*?????? ???????????????????? ????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioRemover})_\n*Plano:* Sem plano cadastrado.\n\nAgora ele n??o possui mais consultorias.`)
                                    )
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        }
                    }
                }

                if (keywordCustom.startsWith('/check')) {
                    if (message.to === '120363025241819134@g.us') {
                        let numeroUsuario = keywordCustom.replace(/[^\d]/g, '');
                        if (!numeroUsuario.startsWith('55')) {
                            numeroUsuario = '55' + numeroUsuario;
                            let pegarNome = await db.getNome(numeroUsuario)
                            let pegarPlanoCliente = await db.getPlano(numeroUsuario);
                            let quantidadeConsultoriaTelefone = await db.getConsultoria(numeroUsuario)
                            let pegarCnpj = await db.getCnpj(numeroUsuario);
                            let pegarEmpresa = await db.getEmpresa(numeroUsuario);
                            let pegarSituacao = await db.getSituacao(numeroUsuario);
                            let pegarMunicipio = await db.getMunicipio(numeroUsuario);
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                client.sendText('120363025241819134@g.us', `*??????? ????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${numeroUsuario})_\n*CNPJ:* ${pegarCnpj}\n*Empresa:* ${pegarEmpresa}\n*Situa????o:* ${pegarSituacao}\n*Munic??pio:* ${pegarMunicipio}\n*Plano:* ${pegarPlanoCliente}\n*Consultorias:* ${quantidadeConsultoriaTelefone}`)
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        } else if (numeroUsuario.startsWith('55')) {
                            let pegarNome = await db.getNome(numeroUsuario)
                            let pegarPlanoCliente = await db.getPlano(numeroUsuario);
                            let quantidadeConsultoriaTelefone = await db.getConsultoria(numeroUsuario)
                            let pegarCnpj = await db.getCnpj(numeroUsuario);
                            let pegarEmpresa = await db.getEmpresa(numeroUsuario);
                            let pegarSituacao = await db.getSituacao(numeroUsuario);
                            let pegarMunicipio = await db.getMunicipio(numeroUsuario);
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                client.sendText('120363025241819134@g.us', `*??????? ????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${numeroUsuario})_\n*CNPJ:* ${pegarCnpj}\n*Empresa:* ${pegarEmpresa}\n*Situa????o:* ${pegarSituacao}\n*Munic??pio:* ${pegarMunicipio}\n*Plano:* ${pegarPlanoCliente}\n*Consultorias:* ${quantidadeConsultoriaTelefone}`)
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        }
                    }
                }

                if (keywordCustom.startsWith('/add consultoria')) {
                    if (message.to === '120363025241819134@g.us') {
                        let numeroUsuario = keywordCustom.replace(/[^\d]/g, '');
                        if (!numeroUsuario.startsWith('55')) {
                            numeroUsuario = '55' + numeroUsuario;
                            let pegarNome = await db.getNome(numeroUsuario)
                            let pegarPlanoCliente = await db.getPlano(numeroUsuario);
                            let quantidadeConsultoriaTelefone = await db.getConsultoria(numeroUsuario)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                let quantidadeNova = Number(quantidadeConsultoriaTelefone) + 1
                                await db.setConsultoria(quantidadeNova, numeroUsuario)
                                client.sendText('120363025241819134@g.us', `*??? ???????????? ????????????????????????????????????????????*\n\n_Foi acrescentada 01 (uma) consultoria para:_\n\n*Cliente:* ${pegarNome}\n_(${numeroUsuario})_\n*Plano:* ${pegarPlanoCliente}\n*Consultorias:* ${quantidadeNova}`)
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        } else if (numeroUsuario.startsWith('55')) {
                            let pegarNome = await db.getNome(numeroUsuario)
                            let pegarPlanoCliente = await db.getPlano(numeroUsuario);
                            let quantidadeConsultoriaTelefone = await db.getConsultoria(numeroUsuario)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                let quantidadeNova = Number(quantidadeConsultoriaTelefone) + 1
                                await db.setConsultoria(quantidadeNova, numeroUsuario)
                                client.sendText('120363025241819134@g.us', `*??? ???????????? ????????????????????????????????????????????*\n\n_Foi acrescentada 01 (uma) consultoria para:_\n\n*Cliente:* ${pegarNome}\n_(${numeroUsuario})_\n*Plano:* ${pegarPlanoCliente}\n*Consultorias:* ${quantidadeNova}`)
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363025241819134@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        }
                    }
                }

                if (keywordCustom.startsWith('/atender consultoria telefone') || keywordCustom.startsWith('/atender consultoria email')) {
                    if (message.to === '120363026676372633@g.us') {

                        let usuarioTelefone = keywordCustom.replace(/[^\d]/g, '');
                        if (!usuarioTelefone.startsWith('55')) {
                            usuarioTelefone = '55' + usuarioTelefone;
                            let pegarPlanoCliente = await db.getPlano(usuarioTelefone);
                            let pegarNome = await db.getNome(usuarioTelefone)
                            let quantidadeConsultoriaTelefone = await db.getConsultoria(usuarioTelefone)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                if (quantidadeConsultoriaTelefone === 'ilimitado') {
                                    let numeroConsultoria = 'ilimitado'
                                    await db.setConsultoria(numeroConsultoria, usuarioTelefone)
                                    client.sendText('120363026676372633@g.us', `*???? ????????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioTelefone})_\n\n*Consultorias:* ILIMITADO\n\n*Plano:* ${pegarPlanoCliente}`)
                                } else if (Number(quantidadeConsultoriaTelefone) > 0) {
                                    let numeroConsultoria = Number(quantidadeConsultoriaTelefone) - 1;
                                    await db.setConsultoria(numeroConsultoria, usuarioTelefone)
                                    client.sendText('120363026676372633@g.us', `*???? ????????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioTelefone})_\n\n*Consultorias:* ${numeroConsultoria}\n\n*Plano:* ${pegarPlanoCliente}\n\n_*OBS:* O n??mero de consultorias informado j?? est?? atualizado, subtraindo este atendimento._`)
                                } else if (Number(quantidadeConsultoriaTelefone <= 0)) {
                                    client.sendText('120363026676372633@g.us', `*???? ????????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioTelefone})_\n\n*Consultorias:* N??o possui consultorias dispon??veis.\n\n*Plano:* ${pegarPlanoCliente}`)
                                } else if (quantidadeConsultoriaTelefone === 'n??o-cadastrado') {
                                    client.sendText('120363026676372633@g.us', `*???? ????????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioTelefone})_\n\n*Consultorias:* N??o possui consultorias dispon??veis.\n\n*Plano:* N??o possui plano contratado.`)
                                }
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363026676372633@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        } else if (usuarioTelefone.startsWith('55')) {
                            let pegarPlanoCliente = await db.getPlano(usuarioTelefone);
                            let pegarNome = await db.getNome(usuarioTelefone)
                            let quantidadeConsultoriaTelefone = await db.getConsultoria(usuarioTelefone)
                            if (pegarNome !== null && typeof pegarNome !== 'undefined' && pegarNome !== false) {
                                if (quantidadeConsultoriaTelefone === 'ilimitado') {
                                    let numeroConsultoria = 'ilimitado'
                                    await db.setConsultoria(numeroConsultoria, usuarioTelefone)
                                    client.sendText('120363026676372633@g.us', `*???? ????????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioTelefone})_\n\n*Plano:* ${pegarPlanoCliente}\n\n*Novo N?? de Consultorias:* ILIMITADO`)
                                } else if (Number(quantidadeConsultoriaTelefone) > 0) {
                                    let numeroConsultoria = Number(quantidadeConsultoriaTelefone) - 1;
                                    await db.setConsultoria(numeroConsultoria, usuarioTelefone)
                                    client.sendText('120363026676372633@g.us', `*???? ????????????????????????????????????????????*\n\n*Cliente:* ${pegarNome}\n_(${usuarioTelefone})_\n\n*Plano:* ${pegarPlanoCliente}\n\n*Novo N?? de Consultorias:* ${numeroConsultoria}`)
                                } else if (Number(quantidadeConsultoriaTelefone <= 0)) {
                                    client.sendText('120363026676372633@g.us', `*???? ????????????????????????????????????????????*\n\n*Cliente:*${pegarNome}\n_(${usuarioTelefone})_\n\nN??o possui consultorias dispon??veis.\n\n*Plano:* ${pegarPlanoCliente}`)
                                }
                            } else if (pegarNome === null || typeof pegarNome === 'undefined' || pegarNome === false) {
                                client.sendText('120363026676372633@g.us', 'N??mero informado est?? incorreto ou ainda n??o ?? cliente.\nVerifique e tente novamente.')
                            }
                        }
                    }
                }

                if (keywordCustom === '/atender consultoria') {
                    if (message.to === '120363026676372633@g.us') {

                        if (typeof fila.elements[0] === "undefined") {
                            client.sendText('120363026676372633@g.us', '????????\n*N??o h?? ningu??m para atender no momento na fila de "Consultoria"!*');
                        }

                        if (typeof fila.elements[0] !== "undefined") {

                            const quantidadeConsultoriaCustom = await db.getConsultoria(fila.elements[0])

                            if (quantidadeConsultoriaCustom === 'ilimitado') {
                                let numeroConsultoria = 'ilimitado'
                                await db.setConsultoria(numeroConsultoria, fila.elements[0])
                            } else if (Number(quantidadeConsultoriaCustom) > 0) {
                                let numeroConsultoria = Number(quantidadeConsultoriaCustom) - 1;
                                await db.setConsultoria(numeroConsultoria, fila.elements[0])
                            }

                            client.sendText('120363026676372633@g.us', '*???? ???????????????????? ??????????? ???????????????????:*')
                                .then(() => setTimeout(() => client.sendContactVcard('120363026676372633@g.us', fila.elements[0] + '@c.us', getUserNameConsultoria)
                                    .then(() => client.sendText(fila.elements[0] + '@c.us', 'Oi tudo bem? Em que posso te ajudar?')
                                        .then(() => db.setStatusSendoAtendido(fila.elements[0])
                                            .then(() => fila.dequeue(fila.elements[0]))
                                        )
                                    ), 1000)
                                )

                            delay(5000).then(async function () {
                                if (typeof fila.elements[0] !== "undefined") {
                                    client.sendText(fila.elements[0] + '@c.us', `*Posi????o atual: 1*\n*Voc?? ser?? o pr??ximo!*`)
                                }
                                if (typeof fila.elements[1] !== "undefined") {
                                    client.sendText(fila.elements[1] + '@c.us', `*Posi????o atual: 2*`)
                                }
                                if (typeof fila.elements[2] !== "undefined") {
                                    client.sendText(fila.elements[2] + '@c.us', `*Posi????o atual: 3*`)
                                }
                                if (typeof fila.elements[3] !== "undefined") {
                                    client.sendText(fila.elements[3] + '@c.us', `*Posi????o atual: 4*`)
                                }
                                if (typeof fila.elements[4] !== "undefined") {
                                    client.sendText(fila.elements[4] + '@c.us', `*Posi????o atual: 5*`)
                                }
                                if (typeof fila.elements[5] !== "undefined") {
                                    client.sendText(fila.elements[5] + '@c.us', `*Posi????o atual: 6*`)
                                }
                                if (typeof fila.elements[6] !== "undefined") {
                                    client.sendText(fila.elements[6] + '@c.us', `*Posi????o atual: 7*`)
                                }
                                if (typeof fila.elements[7] !== "undefined") {
                                    client.sendText(fila.elements[7] + '@c.us', `*Posi????o atual: 8*`)
                                }
                                if (typeof fila.elements[8] !== "undefined") {
                                    client.sendText(fila.elements[8] + '@c.us', `*Posi????o atual: 9*`)
                                }
                                if (typeof fila.elements[9] !== "undefined") {
                                    client.sendText(fila.elements[9] + '@c.us', `*Posi????o atual: 10*`)
                                }
                            });
                        }
                    }
                }
                if (keywordCustom === '/atender contratar plano') {
                    if (message.to === '120363043600410941@g.us') {
                        if (typeof filaplano.elements[0] === "undefined") {
                            client.sendText('120363043600410941@g.us', '????????\n*N??o h?? ningu??m para atender no momento na fila de "Contratar Plano"!*');
                        }

                        if (typeof filaplano.elements[0] !== "undefined") {
                            client.sendText('120363043600410941@g.us', '*???? ???????????????????? ??????????? ???????????????????:*')
                                .then(() => setTimeout(() => client.sendContactVcard('120363043600410941@g.us', filaplano.elements[0] + '@c.us', getUserNameContratarPlano)
                                    .then(() => client.sendText(filaplano.elements[0] + '@c.us', 'Oi tudo bem? Em que posso te ajudar?')
                                        .then(() => db.setStatusSendoAtendido(filaplano.elements[0])
                                            .then(() => filaplano.dequeue(filaplano.elements[0]))
                                        )
                                    ), 1000)
                                )


                            delay(5000).then(async function () {
                                if (typeof filaplano.elements[0] !== "undefined") {
                                    client.sendText(filaplano.elements[0] + '@c.us', `*Posi????o atual: 1*\n*Voc?? ser?? o pr??ximo!*`)
                                }
                                if (typeof filaplano.elements[1] !== "undefined") {
                                    client.sendText(filaplano.elements[1] + '@c.us', `*Posi????o atual: 2*`)
                                }
                                if (typeof filaplano.elements[2] !== "undefined") {
                                    client.sendText(filaplano.elements[2] + '@c.us', `*Posi????o atual: 3*`)
                                }
                                if (typeof filaplano.elements[3] !== "undefined") {
                                    client.sendText(filaplano.elements[3] + '@c.us', `*Posi????o atual: 4*`)
                                }
                                if (typeof filaplano.elements[4] !== "undefined") {
                                    client.sendText(filaplano.elements[4] + '@c.us', `*Posi????o atual: 5*`)
                                }
                                if (typeof filaplano.elements[5] !== "undefined") {
                                    client.sendText(filaplano.elements[5] + '@c.us', `*Posi????o atual: 6*`)
                                }
                                if (typeof filaplano.elements[6] !== "undefined") {
                                    client.sendText(filaplano.elements[6] + '@c.us', `*Posi????o atual: 7*`)
                                }
                                if (typeof filaplano.elements[7] !== "undefined") {
                                    client.sendText(filaplano.elements[7] + '@c.us', `*Posi????o atual: 8*`)
                                }
                                if (typeof filaplano.elements[8] !== "undefined") {
                                    client.sendText(filaplano.elements[8] + '@c.us', `*Posi????o atual: 9*`)
                                }
                                if (typeof filaplano.elements[9] !== "undefined") {
                                    client.sendText(filaplano.elements[9] + '@c.us', `*Posi????o atual: 10*`)
                                }
                            });
                        }
                    }
                }
                if (keywordCustom === '/atender contratar servi??o' || keywordCustom === '/atender contratar servico') {
                    if (message.to === '120363025860174520@g.us') {
                        if (typeof filaservico.elements[0] === "undefined") {
                            client.sendText('120363025860174520@g.us', '????????\n*N??o h?? ningu??m para atender no momento na fila de "Contratar Servi??o"!*');
                        }

                        if (typeof filaservico.elements[0] !== "undefined") {
                            client.sendText('120363025860174520@g.us', '*???? ???????????????????? ??????????? ???????????????????:*')
                                .then(() => setTimeout(() => client.sendContactVcard('120363025860174520@g.us', filaservico.elements[0] + '@c.us', getUserNameContratarServico).then(() => client.sendText(filaservico.elements[0] + '@c.us', 'Oi tudo bem? Em que posso te ajudar?')
                                    .then(() => db.setStatusSendoAtendido(filaservico.elements[0])
                                        .then(() => filaservico.dequeue(filaservico.elements[0]))
                                    )
                                ), 1000)
                                )


                            delay(5000).then(async function () {
                                if (typeof filaservico.elements[0] !== "undefined") {
                                    client.sendText(filaservico.elements[0] + '@c.us', `*Posi????o atual: 1*\n*Voc?? ser?? o pr??ximo!*`)
                                }
                                if (typeof filaservico.elements[1] !== "undefined") {
                                    client.sendText(filaservico.elements[1] + '@c.us', `*Posi????o atual: 2*`)
                                }
                                if (typeof filaservico.elements[2] !== "undefined") {
                                    client.sendText(filaservico.elements[2] + '@c.us', `*Posi????o atual: 3*`)
                                }
                                if (typeof filaservico.elements[3] !== "undefined") {
                                    client.sendText(filaservico.elements[3] + '@c.us', `*Posi????o atual: 4*`)
                                }
                                if (typeof filaservico.elements[4] !== "undefined") {
                                    client.sendText(filaservico.elements[4] + '@c.us', `*Posi????o atual: 5*`)
                                }
                                if (typeof filaservico.elements[5] !== "undefined") {
                                    client.sendText(filaservico.elements[5] + '@c.us', `*Posi????o atual: 6*`)
                                }
                                if (typeof filaservico.elements[6] !== "undefined") {
                                    client.sendText(filaservico.elements[6] + '@c.us', `*Posi????o atual: 7*`)
                                }
                                if (typeof filaservico.elements[7] !== "undefined") {
                                    client.sendText(filaservico.elements[7] + '@c.us', `*Posi????o atual: 8*`)
                                }
                                if (typeof filaservico.elements[8] !== "undefined") {
                                    client.sendText(filaservico.elements[8] + '@c.us', `*Posi????o atual: 9*`)
                                }
                                if (typeof filaservico.elements[9] !== "undefined") {
                                    client.sendText(filaservico.elements[9] + '@c.us', `*Posi????o atual: 10*`)
                                }
                            });
                        }
                    }
                }
            }
        }

    });

    /// DETECTAR MENSAGENS E RESPONDER
    client.onMessage(async (message) => {

        const user = message.from.replace(/\D/g, '');
        const getUserFrom = await db.getUser(user);
        const keyword = String(message.body).toLowerCase();
        const replyMessage = await db.getReply(keyword);
        const getUserStatus = await db.getStatus(user);
        const getUserName = await db.getNome(user);
        const quantidadeConsultoria = await db.getConsultoria(user);
        const planoContratado = await db.getPlano(user);

        if (message.isGroupMsg === false) {

            if (message.from === '5511952275405@c.us') {
                if (message.body === '/duty') {
                    if (getUserStatus === 'duty') {
                        client.sendText(message.from, '*???? ??????????? ?????????????????????? ????????? ?????????????????????*\n*?????? ?????????????????? ?? ?????????*')
                        delay(1000).then(async function () {
                            await db.setStatusOff(user);
                            mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName);
                        });
                    } else if (getUserStatus !== 'duty') {
                        client.sendText(message.from, '*???? ??????????? ?????????????????????? ????????? ?????????????????????*\n*?????? ?????????????????? ?? ?????*')
                        await db.setStatusDuty(user);
                    }
                }
            }

            if (getUserFrom === false) {
                perguntarNome(message, client, db.setUser(user))
                //setTimeout(async () => await db.setUser(user), 3000)
            }

            if (getUserFrom === true) {

                if (keyword !== null) {

                    if (getUserStatus === 'recuperacao01') {
                        perguntarNomeRecuperacao(message, client, db.setStatusEtapa00(user))
                        //setTimeout(async () => await db.setStatusEtapa00(user), 3000)
                    };

                    if (getUserStatus === 'recuperacao02') {
                        perguntarMeiRecuperacao(message, client, db.setStatusEtapa02(user))
                        //setTimeout(async () => await db.setStatusEtapa02(user), 3000)
                    };

                    if (getUserStatus === 'etapa00') {

                        if (message.body !== null) {

                            await db.setNome(message.body, user)
                                .then(async () => await db.setStatusEtapa01(user)
                                    .then(() => confirmarNome(message, client, message.body))
                                )

                        } else {
                            nomeInvalido(message, client);
                        }

                    }

                    if (getUserStatus === 'etapa01') {

                        if (keyword === 'sim, esse ?? meu nome') {
                            await db.setStatusEtapa02(user)
                                .then(() => primeiraVez(message, client, getUserName))
                        } else if (keyword === 'n??o, esse n??o ?? meu nome') {
                            await db.setRazaoSocial('n??o-cadastrado', user)
                                .then(async () => await db.setStatusEtapa00(user)
                                    .then(() => corrigirNome(message, client))
                                )
                        } else {
                            nomeNaoConfirmado(message, client);
                        }

                    }

                    if (getUserStatus === 'etapa02') {

                        if (keyword === 'sim, eu j?? tenho mei') {
                            await db.setStatusEtapa03(user)
                                .then(() => cnpjSim(message, client))
                        } else if (keyword === 'n??o, eu ainda n??o tenho mei') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicialCadastro(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            delay(tempoBot).then(async function () {
                                await db.setStatusOn(user);
                            });
                        } else {
                            meiNaoConfirmado(message, client);
                        }

                    }

                    if (getUserStatus === 'etapa03') {

                        let CNPJ = validarCNPJ(message.body)

                        if (keyword === 'cancelar') {
                            await db.setStatusEtapa02(user)
                                .then(() => corrigirCadastro(message, client))
                        }

                        if (keyword !== 'cancelar') {

                            if (CNPJ === true) {

                                let valorCNPJ = message.body.replace(/[^\d]+/g, '');

                                async function adicionarDados(a) {
                                    await db.setRazaoSocial(a.nome, user)
                                        .then(async () => await db.setSituacao(a.situacao, user)
                                            .then(async () => await db.setMunicipio(a.municipio, user)
                                                .then(async () => await db.setCnpj(valorCNPJ, user)
                                                    .then(async () => await db.setStatusOff(user)
                                                        .then(async () => mensagemInicialCadastro(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                                                    )
                                                )
                                            )
                                        )
                                };

                                // consulta receitaws
                                instance(valorCNPJ).then(v => adicionarDados(v.data), (error => cadastroErro(message, client)))

                                delay(tempoBot).then(async function () {
                                    await db.setStatusOn(user);
                                });

                            }

                            else if (CNPJ === false) {
                                cnpjIncorreto(message, client)
                            }

                        }

                    }

                    if (getUserStatus === 'on') {
                        delay(0).then(async function () {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                        });

                        delay(tempoBot).then(async function () {
                            await db.setStatusOn(user);
                        });
                    }

                    else if (getUserStatus === 'off' || getUserStatus === 'filaatendimento') {

                        if (getUserStatus === 'filaatendimento') {
                            if (keyword === 'cancelar atendimento') {

                                delay(0).then(async function () {
                                    if (fila.elements[0] == user) {
                                        if (typeof fila.elements[1] !== "undefined") {
                                            client.sendText(fila.elements[1] + '@c.us', `*Posi????o atual: 1*\n*Voc?? ser?? o pr??ximo!*`)
                                        }
                                        fila.dequeue(fila.elements[0]);
                                        mandarFilaBot(message, client, fila, 'Consultoria')
                                    }
                                    if (fila.elements[1] == user) {
                                        if (typeof fila.elements[2] !== "undefined") {
                                            client.sendText(fila.elements[2] + '@c.us', `*Posi????o atual: 2*`)
                                        }
                                        fila.dequeue(fila.elements[1]);
                                        mandarFilaBot(message, client, fila, 'Consultoria')
                                    }
                                    if (fila.elements[2] == user) {
                                        if (typeof fila.elements[3] !== "undefined") {
                                            client.sendText(fila.elements[3] + '@c.us', `*Posi????o atual: 3*`)
                                        }
                                        fila.dequeue(fila.elements[2]);
                                        mandarFilaBot(message, client, fila, 'Consultoria')
                                    }
                                    if (fila.elements[3] == user) {
                                        if (typeof fila.elements[4] !== "undefined") {
                                            client.sendText(fila.elements[4] + '@c.us', `*Posi????o atual: 4*`)
                                        }
                                        fila.dequeue(fila.elements[3]);
                                        mandarFilaBot(message, client, fila, 'Consultoria')
                                    }
                                    if (filaservico.elements[0] == user) {
                                        if (typeof filaservico.elements[1] !== "undefined") {
                                            client.sendText(filaservico.elements[1] + '@c.us', `*Posi????o atual: 1*\n*Voc?? ser?? o pr??ximo!*`)
                                        }
                                        filaservico.dequeue(filaservico.elements[0]);
                                        mandarFilaBot(message, client, filaservico, 'Contratar Servi??o')
                                    }
                                    if (filaservico.elements[1] == user) {
                                        if (typeof filaservico.elements[2] !== "undefined") {
                                            client.sendText(filaservico.elements[2] + '@c.us', `*Posi????o atual: 2*`)
                                        }
                                        filaservico.dequeue(filaservico.elements[1]);
                                        mandarFilaBot(message, client, filaservico, 'Contratar Servi??o')
                                    }
                                    if (filaservico.elements[2] == user) {
                                        if (typeof filaservico.elements[3] !== "undefined") {
                                            client.sendText(filaservico.elements[3] + '@c.us', `*Posi????o atual: 3*`)
                                        }
                                        filaservico.dequeue(filaservico.elements[2]);
                                        mandarFilaBot(message, client, filaservico, 'Contratar Servi??o')
                                    }
                                    if (filaservico.elements[3] == user) {
                                        if (typeof filaservico.elements[4] !== "undefined") {
                                            client.sendText(filaservico.elements[4] + '@c.us', `*Posi????o atual: 4*`)
                                        }
                                        filaservico.dequeue(filaservico.elements[3]);
                                        mandarFilaBot(message, client, filaservico, 'Contratar Servi??o')
                                    }
                                    if (filaplano.elements[0] == user) {
                                        if (typeof filaplano.elements[1] !== "undefined") {
                                            client.sendText(filaplano.elements[1] + '@c.us', `*Posi????o atual: 1*\n*Voc?? ser?? o pr??ximo!*`)
                                        }
                                        filaplano.dequeue(filaplano.elements[0]);
                                        mandarFilaBot(message, client, filaplano, 'Contratar Plano')
                                    }
                                    if (filaplano.elements[1] == user) {
                                        if (typeof filaplano.elements[2] !== "undefined") {
                                            client.sendText(filaplano.elements[2] + '@c.us', `*Posi????o atual: 2*`)
                                        }
                                        filaplano.dequeue(filaplano.elements[1]);
                                        mandarFilaBot(message, client, filaplano, 'Contratar Plano')
                                    }
                                    if (filaplano.elements[2] == user) {
                                        if (typeof filaplano.elements[3] !== "undefined") {
                                            client.sendText(filaplano.elements[3] + '@c.us', `*Posi????o atual: 3*`)
                                        }
                                        filaplano.dequeue(filaplano.elements[2]);
                                        mandarFilaBot(message, client, filaplano, 'Contratar Plano')
                                    }
                                    if (filaplano.elements[3] == user) {
                                        if (typeof filaplano.elements[4] !== "undefined") {
                                            client.sendText(filaplano.elements[4] + '@c.us', `*Posi????o atual: 4*`)
                                        }
                                        filaplano.dequeue(filaplano.elements[3]);
                                        mandarFilaBot(message, client, filaplano, 'Contratar Plano')
                                    }

                                }).then(async () => await db.setStatusOff(user)
                                    .then(() => cancelarAtendimento(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                                )

                            } else if (keyword === '??? contratar servi??o' || keyword === '??? contratar plano' || keyword === '???? chat com atendente') {
                                client.sendText(message.from, 'Ops...\nParece que voc?? j?? est?? em uma fila.\nCancele primeiro para poder solicitar um *novo atendimento*.\n\n???????????????? ???????????????????????????????? ???? ????????????????????????????????????????????, ???????????????????????????? *"???????????????????????????????? ????????????????????????????????????????????"*')
                            } else if (keyword === '???? calcular faturamento') {
                                client.sendText(message.from, 'Ops...\nParece que voc?? est?? em uma fila de atendimento.\nCancele primeiro para poder utilizar a ferramenta *Calcular Faturamento*.\n\n???????????????? ???????????????????????????????? ???? ????????????????????????????????????????????, ???????????????????????????? *"???????????????????????????????? ????????????????????????????????????????????"*')
                            }
                        }

                        switch (keyword) {
                            case '?????? ligar telefone fixo':
                                respostaLigarRamal(message, client, atualizarTempo(), regexForaExpediente, getUserName);
                                break;
                            case '[1] ??? requisitos para ser mei':
                                resposta01(message, client);
                                break;
                            case '[2] ??? atividades (cnae) permitidas no mei':
                            case '2?????? atividades permitidas':
                            case '???? atividades permitidas':
                                resposta02(message, client);
                                break;
                            case '[3] ??? vantagens de ser mei':
                                resposta03(message, client);
                                break;
                            case '[4] ??? benef??cios inss e tempo de contribui????o':
                            case '8?????? benef??cios inss':
                                resposta04(message, client);
                                break;
                            case '[5] ??? dispensa de alvar??s e licen??as':
                            case '3?????? dispensa de alvar??s':
                            case '2?????? isen????es e dispensas':
                            case '???? isen????es e dispensas':
                                resposta05(message, client);
                                break;
                            case '???? modelo de termo':
                                modeloTermo(message, client);
                                break;
                            case '[6] ??? como formalizar o mei?':
                            case '1?????? como abrir o mei?':
                                resposta06(message, client);
                                break;
                            case '[7] ??? servidor p??blico pode ser mei?':
                                resposta07(message, client);
                                break;
                            case '[8] ??? quanto o mei paga por m??s?':
                                resposta08(message, client);
                                break;
                            case '[9] ??? como emitir a guia das?':
                            case '???? como emitir o das?':
                            case '1?????? como emitir o das?':
                            case '7?????? como emitir o das?':
                                resposta09(message, client);
                                break;
                            case '[10] ??? declara????o anual do mei':
                                resposta10(message, client);
                                break;
                            case '???? declara????o anual do mei':
                                declaracaoAnual(message, client);
                                break;
                            case '[11] ??? alterar o cadastro do mei':
                                resposta11(message, client);
                                break;
                            case '[12] ??? encerramento (baixa) do mei':
                                resposta12(message, client);
                                break;
                            case '[13] ??? notas fiscais':
                            case '5?????? notas fiscais':
                            case '???? notas fiscais':
                                resposta13(message, client);
                                break;
                            case '[14] ??? desenquadramento do mei':
                            case '???? desenquadramento do mei':
                                resposta14(message, client);
                                break;
                            case '[15] ??? dicas de controle mensal':
                                resposta15(message, client);
                                break;
                            case '???? dicas controle mensal':
                                dicasControleMensal(message, client);
                                break;
                            case '[16] ??? devo declarar imposto de renda?':
                                resposta16(message, client);
                                break;
                            case '[17] ??? limite de faturamento':
                                limiteFaturamento(message, client);
                                break;
                            case '[18] ??? d??vidas frequentes':
                                resposta18(message, client);
                                break;
                            case 'atendimento':
                                mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName);
                                break;
                            case '3?????? faturamento e valor bruto':
                                limiteFaturamentoValorBruto(message, client);
                                break;
                            case '5?????? limite de faturamento':
                            case '???? limite de faturamento':
                                limiteFaturamento(message, client);
                                break;
                            case '1?????? o que ?? emancipa????o?':
                                emancipacao(message, client);
                                break;
                            case '??? o que ?? valor bruto?':
                                valorBruto(message, client);
                                break;
                            case '???? relat??rio receitas brutas':
                                modeloRelatorioReceitasBrutasSebrae(message, client)
                                break;
                            case '???? contas a receber':
                                modeloContasReceber(message, client);
                                break;
                            case '???? contas a pagar':
                                modeloContasPagar(message, client);
                                break;
                            case '???? modelo do relat??rio':
                                modeloRelatorioReceitasBrutas(message, client);
                                break;
                            case '???? diferen??as pj e pf':
                            case '4?????? diferen??as pj e pf':
                                diferencaPJPF(message, client);
                                break;
                            case '???? limite ultrapassado':
                                limiteUltrapassado(message, client);
                                break;
                            case '3?????? cnpj e ccmei':
                            case '???? cnpj e ccmei':
                                cnpjCCMEI(message, client);
                                break;
                            case '4?????? condi????es funcion??rios':
                            case '???? condi????es funcion??rios':
                                condicoesFuncionarios(message, client);
                                break;
                            case '3?????? posso ter filial no mei?':
                            case '5?????? posso ter filial no mei?':
                                filialNoMEI(message, client);
                                break;
                            case '6?????? licita????es':
                                licitacoes(message, client);
                                break;
                            case '1?????? consulta pr??via':
                                consultaPrevia(message, client);
                                break;
                            case '2?????? habite-se':
                                habiteSe(message, client);
                                break;
                            case '??? natureza jur??dica':
                            case '6?????? natureza jur??dica':
                            case '1?????? natureza jur??dica':
                                naturezaJuridica(message, client);
                                break;
                            case '???? planos mensais':
                            case '???? conhecer planos':
                                planosMensais(message, client, atualizarTempo(), regexForaExpediente)
                                break;
                            case '???? servi??os avulsos':
                                servicosAvulsos(message, client, atualizarTempo(), regexForaExpediente);
                                break;
                        }

                        if (getUserStatus === 'off') {
                            switch (keyword) {
                                case '???? chat com atendente':
                                    respostaChatAtendente(message, client, atualizarTempo(), regexForaExpediente, getUserName, db.setStatusAtendimento(user));
                                    break;
                                case '??? contratar plano':
                                    await db.setStatusFilaAtendimento(user)
                                        .then(() => filaDeAtendimento(message, client, user, filaplano, 'Contratar Plano'))
                                    break;
                                case '??? contratar servi??o':
                                    await db.setStatusFilaAtendimento(user)
                                        .then(() => filaDeAtendimento(message, client, user, filaservico, 'Contratar Servi??o'))
                                    break;
                                case '???? calcular faturamento':
                                    await db.setStatusFaturamento2(user);
                                    faturamento1(message, client)
                                    break;
                            }
                        }

                    }

                    else if (getUserStatus === 'faturamento2') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                        };

                        switch (keyword) {
                            case 'sim, formalizei este ano':
                                await db.setStatusFaturamento3(user)
                                    .then(() => faturamento2(message, client))
                                break;
                            case 'n??o, formalizei em outro ano':
                                await db.setStatusFaturamento4('janeiro', user)
                                    .then(() => faturamentoPadrao(message, client))
                                break;
                        }

                        if (keyword !== 'atendimento' && keyword !== 'sim, formalizei este ano' && keyword !== 'n??o, formalizei em outro ano') {
                            formalizacaoNaoConfirmado(message, client);
                        };
                    }

                    else if (getUserStatus === 'faturamento3') {

                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                        };

                        switch (keyword) {
                            case '[1] ??? janeiro':
                                await db.setStatusFaturamento4('janeiro', user)
                                    .then(() => faturamentoJaneiro(message, client))
                                break;
                            case '[2] ??? fevereiro':
                                await db.setStatusFaturamento4('fevereiro', user)
                                    .then(() => faturamentoFevereiro(message, client))
                                break;
                            case '[3] ??? mar??o':
                                await db.setStatusFaturamento4('marco', user)
                                    .then(() => faturamentoMarco(message, client))
                                break;
                            case '[4] ??? abril':
                                await db.setStatusFaturamento4('abril', user)
                                    .then(() => faturamentoAbril(message, client))
                                break;
                            case '[5] ??? maio':
                                await db.setStatusFaturamento4('maio', user)
                                    .then(() => faturamentoMaio(message, client))
                                break;
                            case '[6] ??? junho':
                                await db.setStatusFaturamento4('junho', user)
                                    .then(() => faturamentoJunho(message, client))
                                break;
                            case '[7] ??? julho':
                                await db.setStatusFaturamento4('julho', user)
                                    .then(() => faturamentoJulho(message, client))
                                break;
                            case '[8] ??? agosto':
                                await db.setStatusFaturamento4('agosto', user)
                                    .then(() => faturamentoAgosto(message, client))
                                break;
                            case '[9] ??? setembro':
                                await db.setStatusFaturamento4('setembro', user)
                                    .then(() => faturamentoSetembro(message, client))
                                break;
                            case '[10] ??? outubro':
                                await db.setStatusFaturamento4('outubro', user)
                                    .then(() => faturamentoOutubro(message, client))
                                break;
                            case '[11] ??? novembro':
                                await db.setStatusFaturamento4('novembro', user)
                                    .then(() => faturamentoNovembro(message, client))
                                break;
                            case '[12] ??? dezembro':
                                await db.setStatusFaturamento4('dezembro', user)
                                    .then(() => faturamentoDezembro(message, client))
                                break;
                        }

                        if (keyword !== 'atendimento' && keyword !== '[1] ??? janeiro' && keyword !== '[2] ??? fevereiro' && keyword !== '[3] ??? mar??o' && keyword !== '[4] ??? abril' && keyword !== '[5] ??? maio' && keyword !== '[6] ??? junho' && keyword !== '[7] ??? julho' && keyword !== '[8] ??? agosto' && keyword !== '[9] ??? setembro' && keyword !== '[10] ??? outubro' && keyword !== '[11] ??? novembro' && keyword !== '[12] ??? dezembro') {
                            mesNaoInformado(message, client);
                        };


                    }

                    else if (getUserStatus === 'janeiro') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));
                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(81000, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'fevereiro') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(74250, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'marco') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(67500, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'abril') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(60750, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'maio') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(54000, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'junho') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(47250, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'julho') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(40500, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'agosto') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(33750, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'setembro') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(27000, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'outubro') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(20250, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'novembro') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(13500, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'dezembro') {
                        if (keyword === 'atendimento') {
                            await db.setStatusOff(user)
                                .then(() => mensagemInicial(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };
                        let rawPrice = parseInt(message.body.replace(/[^0-9]/g, ''));

                        if (rawPrice === null || typeof rawPrice === "undefined" || isNaN(rawPrice) === true) {
                            client.sendText(message.from, '*??? ????????????????*\n\nValor inserido incorretamente.\n\n*Modelo:* _00.000,00_\n*M??nimo:* _100,00_\n\n???????????????? ???????????????????????????????? ???????????????????????????? "????????????????????????????????????????????"')
                        } else if (rawPrice !== null && typeof rawPrice !== "undefined" && isNaN(rawPrice) === false) {
                            respostaFaturamento(6750, rawPrice, client, message, user, db);
                        }
                    }

                    else if (getUserStatus === 'atendimento') {
                        if (keyword === 'cancelar atendimento') {
                            await db.setStatusOff(user)
                                .then(() => cancelarAtendimento(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };

                        if (keyword === 'solicitar consultoria') {
                            verificarPlano(message, client, Number(quantidadeConsultoria), planoContratado, db.setStatusConfirmarConsultoria(user))
                        }

                        if (keyword === 'contratar servi??o') {
                            await db.setStatusFilaAtendimento(user).then(() => contratarServico(message, client))

                            delay(10000).then(async function () {
                                filaDeAtendimento(message, client, user, filaservico, 'Contratar Servi??o')
                            })
                        }

                        if (keyword === 'contratar plano') {
                            await db.setStatusFilaAtendimento(user).then(() => contratarPlano(message, client))

                            delay(10000).then(async function () {
                                filaDeAtendimento(message, client, user, filaplano, 'Contratar Plano')
                            })
                        }

                    }

                    else if (getUserStatus === 'consultoria') {
                        if (keyword === 'cancelar atendimento' || keyword === 'n??o, cancelar atendimento') {
                            await db.setStatusOff(user)
                                .then(() => cancelarAtendimento(message, client, atualizarTempo(), regexForaExpediente, getUserName))
                            return;
                        };

                        if (keyword === 'sim, solicitar consultoria') {
                            await db.setStatusFilaAtendimento(user)
                                .then(() => filaDeAtendimento(message, client, user, fila, 'Consultoria'))
                        }

                        if (keyword === 'contratar servi??o') {
                            await db.setStatusFilaAtendimento(user).then(() => contratarServico(message, client))

                            delay(10000).then(async function () {
                                filaDeAtendimento(message, client, user, filaservico, 'Contratar Servi??o')
                            })
                        }

                        if (keyword === 'contratar plano') {
                            await db.setStatusFilaAtendimento(user).then(() => contratarPlano(message, client))

                            delay(10000).then(async function () {
                                filaDeAtendimento(message, client, user, filaplano, 'Contratar Plano')
                            })
                        }

                    }

                }


            }

        }


        // if (getUserFrom === false) {
        //     await db.setUser(user);
        //     const replyMessageWelcome = await db.getReply('oi');
        //     client.sendText(message.from, replyMessageWelcome);
        // } else if (message.body === '5') {
        //     await db.setStatusOff(user);
        //     client.sendText(message.from, 'ChatBot OFF');
        // } else if (message.body === '4') {
        //     await db.setStatusOn(user);
        //     client.sendText(message.from, 'ChatBot ON');
        // } else if (replyMessage !== false && getUserStatus === 'on') {
        //     client.sendText(message.from, replyMessage);
        // }

        //enviarRespostas(message, client);

    });

};

server.listen(port, function () {
    delay(10000).then(async function () {
        console.log('???? Painel rodando no Port: ' + port);
    });
});
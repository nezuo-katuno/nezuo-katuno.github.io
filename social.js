import {
    db, auth,
    collection, addDoc, doc, deleteDoc, setDoc, getDoc, onSnapshot,
    query, orderBy, limit, serverTimestamp,
    onAuthStateChanged, signOut
} from './firebase-config.js';
import { ADMIN_UID } from './config-admin.js';

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const MAX_NOME = 30;                 // caracteres do nome de exibição
const MAX_MENSAGEM = 500;            // caracteres por mensagem
const MENSAGENS_NA_TELA = 60;        // quantas mensagens recentes o chat carrega
const LIMITE_FOTO_CHARS = 60000;     // tamanho máximo da foto (em texto) no Firestore

// ============================================================
// ELEMENTOS
// ============================================================
const barraAbas = document.getElementById('barra-abas');
const botoesAba = document.querySelectorAll('.aba');
const badgeChat = document.getElementById('badge-chat');
const avatarCabecalho = document.getElementById('btn-perfil-cabecalho');

const areaChat = document.getElementById('area-chat');
const listaChat = document.getElementById('lista-chat');
const formChat = document.getElementById('form-chat');
const inputChat = document.getElementById('chat-texto');

const areaPerfil = document.getElementById('area-perfil');
const boxAvatarPerfil = document.getElementById('perfil-avatar');
const perfilUsuario = document.getElementById('perfil-usuario');
const formPerfil = document.getElementById('form-perfil');
const inputNome = document.getElementById('perfil-nome');
const perfilMsg = document.getElementById('perfil-msg');
const btnSalvarPerfil = document.getElementById('btn-salvar-perfil');
const btnTrocarFoto = document.getElementById('btn-trocar-foto');
const inputFoto = document.getElementById('input-foto');
const btnRemoverFoto = document.getElementById('btn-remover-foto');
const btnSairPerfil = document.getElementById('btn-sair-perfil');

// ============================================================
// ESTADO
// ============================================================
let euUid = null;
let euAdmin = false;
let abaAtual = 'agenda';
let perfis = new Map();      // uid -> dados do perfil
let mensagens = [];          // mais antigas primeiro
let cancelar = [];           // funções para parar os "ouvintes" do Firestore
let fotoPendente;            // undefined = sem mudança | '' = remover | texto = foto nova
let rolarProximo = false;    // forçar rolagem até o fim após enviar
let ultimoEnvio = 0;

// ============================================================
// AUXILIARES
// ============================================================
const NS_SVG = 'http://www.w3.org/2000/svg';

function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto; // textContent: nada digitado vira código
    return el;
}

function icone(nome) {
    const svg = document.createElementNS(NS_SVG, 'svg');
    svg.setAttribute('class', 'icone');
    svg.setAttribute('aria-hidden', 'true');
    const uso = document.createElementNS(NS_SVG, 'use');
    uso.setAttribute('href', `#i-${nome}`);
    svg.appendChild(uso);
    return svg;
}

function botaoIcone(nomeIcone, rotulo, classesExtra, aoClicar) {
    const botao = criar('button', `btn-icone pequeno ${classesExtra || ''}`.trim());
    botao.type = 'button';
    botao.setAttribute('aria-label', rotulo);
    botao.title = rotulo;
    botao.appendChild(icone(nomeIcone));
    botao.addEventListener('click', aoClicar);
    return botao;
}

function hash(texto) {
    let h = 0;
    for (const c of texto) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return h;
}

function iniciais(nome) {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    const letras = partes.slice(0, 2).map((p) => Array.from(p)[0]);
    return (letras.join('') || '?').toUpperCase();
}

// Avatar: foto, ou as iniciais sobre uma cor própria de cada pessoa.
function criarAvatar(perfil, uid, tamanho) {
    const nome = (perfil && (perfil.nomeExibicao || perfil.usuario)) || '?';
    const av = criar('span', `avatar ${tamanho || ''}`.trim());
    if (perfil && perfil.foto && perfil.foto.startsWith('data:image/')) {
        const img = document.createElement('img');
        img.src = perfil.foto;
        img.alt = '';
        av.appendChild(img);
    } else {
        av.textContent = iniciais(nome);
        av.style.background = `hsl(${hash(uid || nome) % 360} 52% 42%)`;
    }
    return av;
}

function tempo(m) {
    return m.criadoEm && m.criadoEm.toMillis ? m.criadoEm.toMillis() : Date.now();
}

function horaCurta(ms) {
    return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function rotuloDia(ms) {
    const zera = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const data = new Date(ms);
    const dif = Math.round((zera(new Date()) - zera(data)) / 86400000);
    if (dif === 0) return 'Hoje';
    if (dif === 1) return 'Ontem';
    return data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

// ============================================================
// ABAS
// ============================================================
function mostrarAba(nome) {
    abaAtual = nome;
    document.body.dataset.aba = nome;
    areaChat.hidden = nome !== 'chat';
    areaPerfil.hidden = nome !== 'perfil';

    botoesAba.forEach((b) => {
        const ativa = b.dataset.aba === nome;
        b.classList.toggle('ativa', ativa);
        b.setAttribute('aria-current', ativa ? 'page' : 'false');
    });

    if (nome === 'chat') {
        marcarChatComoLido();
        requestAnimationFrame(rolarChatParaFim);
    } else {
        window.scrollTo({ top: 0 });
    }
}

botoesAba.forEach((b) => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));
avatarCabecalho.addEventListener('click', () => mostrarAba('perfil'));
document.body.dataset.aba = 'agenda';

// ============================================================
// PERFIL
// ============================================================
async function garantirPerfil(user) {
    const ref = doc(db, 'perfis', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        const usuario = user.email.split('@')[0];
        await setDoc(ref, {
            usuario,
            nomeExibicao: usuario,
            foto: '',
            atualizadoEm: serverTimestamp()
        });
    }
}

function mensagemPerfil(texto, ok) {
    perfilMsg.textContent = texto;
    perfilMsg.classList.toggle('ok', Boolean(ok));
}

function renderizarCabecalho() {
    const meu = perfis.get(euUid);
    avatarCabecalho.replaceChildren(criarAvatar(meu, euUid));
}

function renderizarPerfil() {
    const meu = perfis.get(euUid);
    if (!meu) return;

    const fotoAtual = fotoPendente !== undefined ? fotoPendente : meu.foto;
    boxAvatarPerfil.replaceChildren(criarAvatar({ ...meu, foto: fotoAtual }, euUid, 'grande'));

    perfilUsuario.replaceChildren(criar('span', '', `@${meu.usuario}`));
    if (euAdmin) perfilUsuario.appendChild(criar('span', 'selo-admin', 'admin'));

    // Não sobrescreve o que a pessoa está digitando.
    if (inputNome.dataset.sujo !== '1') inputNome.value = meu.nomeExibicao || '';

    btnRemoverFoto.hidden = !fotoAtual;
}

// Corta a foto em quadrado, reduz e comprime para caber no Firestore.
function prepararFoto(arquivo, lado = 192) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
        leitor.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Esse arquivo não é uma imagem válida.'));
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = lado;
                canvas.height = lado;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; // fundo para imagens com transparência
                ctx.fillRect(0, 0, lado, lado);

                const corte = Math.min(img.width, img.height);
                const sx = (img.width - corte) / 2;
                const sy = (img.height - corte) / 2;
                ctx.drawImage(img, sx, sy, corte, corte, 0, 0, lado, lado);

                let qualidade = 0.85;
                let dados = canvas.toDataURL('image/jpeg', qualidade);
                while (dados.length > LIMITE_FOTO_CHARS && qualidade > 0.4) {
                    qualidade -= 0.1;
                    dados = canvas.toDataURL('image/jpeg', qualidade);
                }
                if (dados.length > LIMITE_FOTO_CHARS) {
                    reject(new Error('Foto muito pesada. Escolha outra.'));
                } else {
                    resolve(dados);
                }
            };
            img.src = leitor.result;
        };
        leitor.readAsDataURL(arquivo);
    });
}

btnTrocarFoto.addEventListener('click', () => inputFoto.click());

inputFoto.addEventListener('change', async () => {
    const arquivo = inputFoto.files[0];
    inputFoto.value = '';
    if (!arquivo) return;
    try {
        fotoPendente = await prepararFoto(arquivo);
        renderizarPerfil();
        mensagemPerfil('Foto escolhida. Toque em "Salvar perfil" para confirmar.', true);
    } catch (erro) {
        mensagemPerfil(erro.message, false);
    }
});

btnRemoverFoto.addEventListener('click', () => {
    fotoPendente = '';
    renderizarPerfil();
    mensagemPerfil('Foto removida. Toque em "Salvar perfil" para confirmar.', true);
});

inputNome.addEventListener('input', () => { inputNome.dataset.sujo = '1'; });

formPerfil.addEventListener('submit', async (e) => {
    e.preventDefault();
    const meu = perfis.get(euUid);
    if (!meu) {
        mensagemPerfil('O perfil ainda está carregando. Tente de novo em instantes.', false);
        return;
    }

    const nome = inputNome.value.replace(/\s+/g, ' ').trim();
    if (!nome || Array.from(nome).length > MAX_NOME) {
        mensagemPerfil(`O nome deve ter de 1 a ${MAX_NOME} caracteres.`, false);
        return;
    }

    btnSalvarPerfil.disabled = true;
    btnSalvarPerfil.textContent = 'Salvando...';
    try {
        const foto = fotoPendente !== undefined ? fotoPendente : (meu.foto || '');
        await setDoc(doc(db, 'perfis', euUid), {
            usuario: meu.usuario,
            nomeExibicao: nome,
            foto,
            atualizadoEm: serverTimestamp()
        });
        fotoPendente = undefined;
        inputNome.dataset.sujo = '';
        mensagemPerfil('Perfil salvo!', true);
    } catch (erro) {
        console.error('Erro ao salvar perfil:', erro);
        mensagemPerfil('Não foi possível salvar. Verifique a conexão e as regras do Firestore.', false);
    } finally {
        btnSalvarPerfil.disabled = false;
        btnSalvarPerfil.textContent = 'Salvar perfil';
    }
});

btnSairPerfil.addEventListener('click', () => signOut(auth));

// ============================================================
// CHAT
// ============================================================
function pertoDoFim() {
    return listaChat.scrollHeight - listaChat.scrollTop - listaChat.clientHeight < 120;
}

function rolarChatParaFim() {
    listaChat.scrollTop = listaChat.scrollHeight;
}

function chatVazio() {
    const caixa = criar('div', 'chat-vazio');
    caixa.appendChild(icone('chat'));
    caixa.appendChild(criar('p', '', 'Ninguém falou nada ainda. Seja o primeiro!'));
    return caixa;
}

function criarMensagem(m, ms, agrupada) {
    const minha = m.uid === euUid;
    const perfil = perfis.get(m.uid);
    const nome = (perfil && (perfil.nomeExibicao || perfil.usuario)) || 'Usuário';

    const linha = criar('div', `msg${minha ? ' minha' : ''}${agrupada ? ' agrupada' : ''}`);

    if (!minha) {
        linha.appendChild(agrupada ? criar('span', 'msg-espaco') : criarAvatar(perfil, m.uid, 'pequeno'));
    }

    const corpo = criar('div', 'msg-corpo');
    if (!agrupada) {
        const cab = criar('div', 'msg-cab');
        if (!minha) {
            cab.appendChild(criar('span', 'msg-nome', nome));
            if (m.uid === ADMIN_UID) cab.appendChild(criar('span', 'selo-admin', 'admin'));
        }
        cab.appendChild(criar('span', 'msg-hora', horaCurta(ms)));
        corpo.appendChild(cab);
    }
    corpo.appendChild(criar('div', 'msg-balao', m.texto));
    linha.appendChild(corpo);

    // Cada um apaga as próprias mensagens; o admin apaga qualquer uma.
    if (minha || euAdmin) {
        linha.appendChild(botaoIcone('lixeira', 'Apagar mensagem', 'perigo msg-apagar', () => apagarMensagem(m.id)));
    }
    return linha;
}

function renderizarChat() {
    const estavaNoFim = pertoDoFim();
    listaChat.replaceChildren();

    if (mensagens.length === 0) {
        listaChat.appendChild(chatVazio());
        return;
    }

    let anterior = null;
    mensagens.forEach((m) => {
        const ms = tempo(m);

        if (!anterior || rotuloDia(ms) !== rotuloDia(anterior.ms)) {
            listaChat.appendChild(criar('div', 'dia-sep', rotuloDia(ms)));
            anterior = null;
        }

        const agrupada = Boolean(anterior) && anterior.uid === m.uid && ms - anterior.ms < 5 * 60 * 1000;
        listaChat.appendChild(criarMensagem(m, ms, agrupada));
        anterior = { uid: m.uid, ms };
    });

    if (estavaNoFim || rolarProximo) {
        rolarChatParaFim();
        rolarProximo = false;
    }
}

async function apagarMensagem(id) {
    if (!confirm('Apagar esta mensagem?')) return;
    try {
        await deleteDoc(doc(db, 'mensagens', id));
    } catch (erro) {
        console.error('Erro ao apagar mensagem:', erro);
        alert('Não foi possível apagar a mensagem.');
    }
}

function ajustarAlturaCampo() {
    inputChat.style.height = 'auto';
    inputChat.style.height = `${Math.min(inputChat.scrollHeight, 120)}px`;
}

inputChat.addEventListener('input', ajustarAlturaCampo);

// No computador, Enter envia (Shift+Enter quebra linha). No celular, Enter quebra linha.
const temMouse = window.matchMedia('(pointer: fine)').matches;
inputChat.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && temMouse) {
        e.preventDefault();
        formChat.requestSubmit();
    }
});

formChat.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = inputChat.value.trim();
    if (!texto || !euUid) return;
    if (Date.now() - ultimoEnvio < 800) return; // evita enviar sem querer várias vezes seguidas
    ultimoEnvio = Date.now();

    inputChat.value = '';
    ajustarAlturaCampo();
    rolarProximo = true;

    try {
        await addDoc(collection(db, 'mensagens'), {
            uid: euUid,
            texto: texto.slice(0, MAX_MENSAGEM),
            criadoEm: serverTimestamp()
        });
    } catch (erro) {
        console.error('Erro ao enviar mensagem:', erro);
        inputChat.value = texto; // devolve o texto para a pessoa não perder o que escreveu
        ajustarAlturaCampo();
        alert('Não foi possível enviar. Verifique a conexão.');
    }
});

// ============================================================
// MENSAGENS NÃO LIDAS (bolinha na aba Chat)
// ============================================================
function lerChatVisto() {
    try { return Number(localStorage.getItem('chatVisto')) || 0; } catch (e) { return 0; }
}

function gravarChatVisto(ms) {
    try { localStorage.setItem('chatVisto', String(ms)); } catch (e) { /* ignora */ }
}

function marcarChatComoLido() {
    const ultima = mensagens.length ? tempo(mensagens[mensagens.length - 1]) : Date.now();
    gravarChatVisto(ultima);
    badgeChat.hidden = true;
}

function atualizarNaoLidas() {
    if (abaAtual === 'chat') {
        marcarChatComoLido();
        return;
    }
    const visto = lerChatVisto();
    const n = mensagens.filter((m) => m.uid !== euUid && tempo(m) > visto).length;
    badgeChat.hidden = n === 0;
    badgeChat.textContent = n > 9 ? '9+' : String(n);
}

// ============================================================
// OUVINTES EM TEMPO REAL
// ============================================================
function encerrarOuvintes() {
    cancelar.forEach((parar) => parar());
    cancelar = [];
}

function iniciarOuvintes() {
    // Primeira vez neste aparelho: nada conta como "não lido".
    if (lerChatVisto() === 0) gravarChatVisto(Date.now());

    cancelar.push(onSnapshot(collection(db, 'perfis'), (snapshot) => {
        perfis = new Map();
        snapshot.forEach((d) => perfis.set(d.id, d.data()));
        renderizarCabecalho();
        renderizarPerfil();
        renderizarChat(); // nomes e fotos podem ter mudado
    }, (erro) => console.error('Erro nos perfis:', erro)));

    const consulta = query(
        collection(db, 'mensagens'),
        orderBy('criadoEm', 'desc'),
        limit(MENSAGENS_NA_TELA)
    );
    cancelar.push(onSnapshot(consulta, (snapshot) => {
        mensagens = [];
        snapshot.forEach((d) => {
            mensagens.push({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) });
        });
        mensagens.reverse(); // da mais antiga para a mais nova
        renderizarChat();
        atualizarNaoLidas();
    }, (erro) => {
        console.error('Erro no chat:', erro);
        listaChat.replaceChildren(criar('div', 'chat-vazio', 'Não foi possível carregar o chat.'));
    }));
}

// ============================================================
// QUEM ESTÁ LOGADO
// ============================================================
onAuthStateChanged(auth, async (user) => {
    encerrarOuvintes();

    if (!user) {
        euUid = null;
        euAdmin = false;
        perfis = new Map();
        mensagens = [];
        fotoPendente = undefined;
        inputNome.dataset.sujo = '';
        perfilMsg.textContent = '';
        barraAbas.hidden = true;
        avatarCabecalho.hidden = true;
        listaChat.replaceChildren();
        mostrarAba('agenda');
        return;
    }

    euUid = user.uid;
    euAdmin = user.uid === ADMIN_UID;
    barraAbas.hidden = false;
    avatarCabecalho.hidden = false;
    mostrarAba('agenda');

    try {
        await garantirPerfil(user);
    } catch (erro) {
        console.error('Erro ao preparar o perfil:', erro);
    }

    // Se a pessoa saiu (ou trocou de conta) enquanto esperava, não começa nada.
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
    iniciarOuvintes();
});
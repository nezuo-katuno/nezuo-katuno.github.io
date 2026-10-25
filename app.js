import {
    db, auth,
    collection, addDoc, doc, deleteDoc, updateDoc, onSnapshot,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from './firebase-config.js';
import { ADMIN_UID } from './config-admin.js';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

// O Firebase só aceita login com e-mail. Para o usuário digitar apenas o nome,
// o site monta um e-mail interno (usuario@agenda-escolar.app). Ele não precisa existir.
const DOMINIO_INTERNO = "agenda-escolar.app";

const materias = [
    { id: 1, nome: "Matemática", professor: "Profa. Pétria" },
    { id: 2, nome: "Física", professor: "Prof. Fábio" },
    { id: 3, nome: "Química", professor: "Profa. Amanda" },
    { id: 4, nome: "Animação 3D", professor: "Prof. Robson" },
    { id: 5, nome: "TDDGAIII", professor: "Prof. Robson" },
    { id: 6, nome: "Ética e Cidadania", professor: "Profa. Juliana" },
    { id: 7, nome: "Português", professor: "Profa. Mariângela" },
    { id: 8, nome: "TLBD", professor: "Prof. Jackson" },
    { id: 9, nome: "Inglês", professor: "Prof. Gilson" },
    { id: 10, nome: "Espanhol", professor: "Profa. Janaina" },
    { id: 11, nome: "LPII", professor: "Prof. Marcos" },
    { id: 12, nome: "PDTCC", professor: "Prof. Luiz Angelo" },
    { id: 13, nome: "Filosofia", professor: "Prof. Carlos" },
    { id: 14, nome: "Sociologia", professor: "Prof. Carlos" },
    { id: 15, nome: "Programação Mobile", professor: "Prof. Marcos" },
    { id: 16, nome: "Marketing de Jogos", professor: "Prof. João Paulo" }
];

// O documento do Firestore aceita ~1 MB. A imagem vira texto (base64) e cresce ~33%,
// então limitamos o texto final em vez do tamanho do arquivo original.
const LIMITE_IMAGEM_CHARS = 700000;

// Grupos da lista, do mais urgente para o mais distante.
const GRUPOS = [
    { chave: 'atrasadas', titulo: 'Atrasadas', testa: (d) => d < 0 },
    { chave: 'hoje', titulo: 'Hoje', testa: (d) => d === 0 },
    { chave: 'amanha', titulo: 'Amanhã', testa: (d) => d === 1 },
    { chave: 'semana', titulo: 'Esta semana', testa: (d) => d >= 2 && d <= 7 },
    { chave: 'depois', titulo: 'Mais para frente', testa: (d) => d > 7 }
];

// ============================================================
// ELEMENTOS DA PÁGINA
// ============================================================
const modal = document.getElementById('modal');
const modalTitulo = document.getElementById('modal-titulo');
const btnNova = document.getElementById('btn-nova-atividade');
const btnFechar = document.querySelector('.fechar');
const form = document.getElementById('form-atividade');
const selectMateria = document.getElementById('materia');
const listaAtividades = document.getElementById('lista-atividades');
const btnTema = document.getElementById('btn-tema');
const metaTema = document.getElementById('meta-tema');

const telaLogin = document.getElementById('tela-login');
const formLogin = document.getElementById('form-login');
const inputUsuario = document.getElementById('login-usuario');
const inputSenha = document.getElementById('login-senha');
const btnEntrar = document.getElementById('btn-entrar');
const btnCriarConta = document.getElementById('btn-criar-conta');
const msgLogin = document.getElementById('login-msg');
const areaApp = document.getElementById('area-app');
const spanUsuario = document.getElementById('usuario-logado');
const btnSair = document.getElementById('btn-sair');

const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('img');

// ============================================================
// AUXILIARES (criar elementos e ícones)
// ============================================================
const NS_SVG = 'http://www.w3.org/2000/svg';

function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto; // textContent: nada digitado vira HTML/código
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

function trocarIcone(botao, nome) {
    botao.querySelector('use').setAttribute('href', `#i-${nome}`);
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

// ============================================================
// TEMA (CLARO/ESCURO) - começa pelo tema do aparelho
// ============================================================
function aplicarTema(escuro) {
    document.body.classList.toggle('dark-mode', escuro);
    trocarIcone(btnTema, escuro ? 'sol' : 'lua');
    btnTema.setAttribute('aria-label', escuro ? 'Usar tema claro' : 'Usar tema escuro');
    metaTema.setAttribute('content', escuro ? '#0E1120' : '#F2F4FA');
}

let temaSalvo = null;
try { temaSalvo = localStorage.getItem('tema'); } catch (e) { /* sem localStorage */ }
aplicarTema(
    temaSalvo
        ? temaSalvo === 'escuro'
        : window.matchMedia('(prefers-color-scheme: dark)').matches
);

btnTema.addEventListener('click', () => {
    const escuro = !document.body.classList.contains('dark-mode');
    aplicarTema(escuro);
    try { localStorage.setItem('tema', escuro ? 'escuro' : 'claro'); } catch (e) { /* ignora */ }
});

// ============================================================
// LOGIN COM NOME DE USUÁRIO + SENHA
// ============================================================
function validarUsuario(texto) {
    const usuario = texto.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(usuario)) {
        throw new Error("O nome de usuário deve ter de 3 a 20 caracteres: só letras, números e _.");
    }
    return usuario;
}

function traduzirErroAuth(erro) {
    switch (erro.code) {
        case 'auth/email-already-in-use': return "Esse nome de usuário já existe. Escolha outro ou entre.";
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password': return "Usuário ou senha incorretos.";
        case 'auth/weak-password': return "A senha precisa ter pelo menos 6 caracteres.";
        case 'auth/too-many-requests': return "Muitas tentativas. Espere um pouco e tente de novo.";
        case 'auth/network-request-failed': return "Sem conexão. Verifique a internet.";
        case 'auth/operation-not-allowed': return "Login por e-mail/senha desativado no Firebase. Ative em Authentication > Sign-in method.";
        default: return erro.message || "Não foi possível entrar. Tente de novo.";
    }
}

async function autenticar(criarConta) {
    msgLogin.textContent = '';
    btnEntrar.disabled = true;
    btnCriarConta.disabled = true;
    try {
        const usuario = validarUsuario(inputUsuario.value);
        const email = `${usuario}@${DOMINIO_INTERNO}`;
        const senha = inputSenha.value;

        if (criarConta) {
            await createUserWithEmailAndPassword(auth, email, senha);
        } else {
            await signInWithEmailAndPassword(auth, email, senha);
        }
        formLogin.reset();
    } catch (erro) {
        console.error(erro);
        msgLogin.textContent = traduzirErroAuth(erro);
    } finally {
        btnEntrar.disabled = false;
        btnCriarConta.disabled = false;
    }
}

formLogin.addEventListener('submit', (e) => {
    e.preventDefault();
    autenticar(false);
});

btnCriarConta.addEventListener('click', () => {
    if (!formLogin.reportValidity()) return;
    autenticar(true);
});

btnSair.addEventListener('click', () => signOut(auth));

// ============================================================
// SELECT DE MATÉRIAS
// ============================================================
materias.forEach(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.nome} (${m.professor})`;
    selectMateria.appendChild(option);
});

// ============================================================
// MODAL (adicionar / editar) - só o admin chega aqui
// ============================================================
let editandoId = null;

function abrirModal(atividade) {
    editandoId = atividade ? atividade.id : null;
    modalTitulo.textContent = atividade ? 'Editar Atividade' : 'Adicionar Atividade';

    if (atividade) {
        document.getElementById('titulo').value = atividade.titulo || '';
        selectMateria.value = atividade.materiaId;
        document.getElementById('prazo').value = atividade.prazo || '';
        document.getElementById('descricao').value = atividade.descricao || '';
    }
    modal.classList.remove('oculto');
    document.body.classList.add('sem-rolagem');
}

function fecharModal() {
    modal.classList.add('oculto');
    document.body.classList.remove('sem-rolagem');
    form.reset();
    editandoId = null;
    modalTitulo.textContent = 'Adicionar Atividade';
}

btnNova.addEventListener('click', () => abrirModal(null));
btnFechar.addEventListener('click', fecharModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) fecharModal();
});

// ============================================================
// IMAGEM AMPLIADA
// ============================================================
function abrirImagem(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt;
    lightbox.hidden = false;
}

function fecharImagem() {
    lightbox.hidden = true;
    lightboxImg.removeAttribute('src');
}

lightbox.addEventListener('click', fecharImagem);

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!lightbox.hidden) fecharImagem();
    else if (!modal.classList.contains('oculto')) fecharModal();
});

// ============================================================
// DATAS E CORES
// ============================================================
function diasAte(prazo) {
    if (!prazo) return Infinity;
    const [ano, mes, dia] = prazo.split('-').map(Number);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.round((new Date(ano, mes - 1, dia) - hoje) / 86400000);
}

function dataLocal(prazo) {
    const [ano, mes, dia] = prazo.split('-').map(Number);
    return new Date(ano, mes - 1, dia);
}

function textoSituacao(dias) {
    if (dias === Infinity) return 'Sem prazo';
    if (dias < 0) return dias === -1 ? 'Venceu ontem' : `Venceu há ${-dias} dias`;
    if (dias === 0) return 'Vence hoje';
    if (dias === 1) return 'Vence amanhã';
    return `Em ${dias} dias`;
}

function classeUrgencia(dias) {
    if (dias < 0) return 'urgencia-atrasada';
    if (dias === 0) return 'urgencia-hoje';
    if (dias === 1) return 'urgencia-amanha';
    return 'urgencia-futura';
}

// Cada matéria ganha sua própria cor (distribuída pelo círculo de cores).
function corDaMateria(id) {
    return `hsl(${Math.round((Number(id) * 137.508) % 360)} 62% 46%)`;
}

// ============================================================
// ATIVIDADES: cache + tempo real
// ============================================================
let atividades = [];
let ehAdmin = false;
let cancelarEscuta = null;
let jaDesenhou = false; // a animação de entrada só acontece na primeira vez

function lerCache() {
    try {
        return JSON.parse(localStorage.getItem('cacheAtividades')) || [];
    } catch (e) {
        return [];
    }
}

function limparCache() {
    try { localStorage.removeItem('cacheAtividades'); } catch (e) { /* ignora */ }
}

function escutarAtividades() {
    return onSnapshot(collection(db, "atividades"), (snapshot) => {
        atividades = [];
        snapshot.forEach((d) => {
            atividades.push({ id: d.id, ...d.data() });
        });

        // Primeiro desenha a tela: se o cache falhar, a lista continua atualizando.
        renderizarAtividades();

        // Cache sem as imagens (o localStorage tem só ~5 MB).
        try {
            const leve = atividades.map(({ imagem, ...resto }) => resto);
            localStorage.setItem('cacheAtividades', JSON.stringify(leve));
        } catch (e) { /* cache cheio ou indisponível: não é grave */ }
    }, (erro) => {
        console.error("Erro no Firebase: ", erro);
        listaAtividades.replaceChildren(
            criar('p', 'vazio', 'Não foi possível carregar as atividades. Entre de novo ou verifique a conexão.')
        );
    });
}

function estadoVazio() {
    const caixa = criar('div', 'vazio');
    caixa.appendChild(icone('calendario-ok'));
    caixa.appendChild(criar('h2', '', 'Nada pendente'));
    caixa.appendChild(criar('p', '', ehAdmin
        ? 'Toque em "+" para adicionar a primeira atividade.'
        : 'Quando houver atividades, elas aparecem aqui.'));
    return caixa;
}

function criarCartao(ativ, indice, animar) {
    const mat = materias.find(m => m.id == ativ.materiaId) || { nome: "Desconhecida", professor: "-" };
    const dias = diasAte(ativ.prazo);

    const card = criar('article', `tarefa ${classeUrgencia(dias)}`);
    card.style.setProperty('--materia', corDaMateria(ativ.materiaId));
    if (animar) {
        card.classList.add('entrada');
        card.style.setProperty('--i', Math.min(indice, 8));
    }

    // Bloco da data (dia da semana, dia, mês)
    const bloco = criar('div', 'tarefa-data');
    if (ativ.prazo) {
        const data = dataLocal(ativ.prazo);
        const semana = data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        const mes = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        bloco.appendChild(criar('span', 'semana', semana));
        bloco.appendChild(criar('span', 'dia', String(data.getDate())));
        bloco.appendChild(criar('span', 'mes', mes));
    } else {
        bloco.appendChild(criar('span', 'dia', '-'));
    }
    card.appendChild(bloco);

    // Corpo do cartão
    const corpo = criar('div', 'tarefa-corpo');

    const topo = criar('div', 'tarefa-topo');
    topo.appendChild(criar('span', 'chip-materia', mat.nome));
    topo.appendChild(criar('span', 'situacao', textoSituacao(dias)));
    corpo.appendChild(topo);

    corpo.appendChild(criar('h3', '', ativ.titulo));

    const professor = criar('p', 'professor');
    professor.appendChild(icone('usuario'));
    professor.appendChild(document.createTextNode(mat.professor));
    corpo.appendChild(professor);

    if (ativ.descricao) corpo.appendChild(criar('p', 'descricao', ativ.descricao));

    if (ativ.imagem && ativ.imagem.startsWith('data:image/')) {
        const img = criar('img', 'tarefa-img');
        img.src = ativ.imagem;
        img.alt = `Imagem da atividade ${ativ.titulo}`;
        img.loading = 'lazy';
        img.addEventListener('click', () => abrirImagem(ativ.imagem, img.alt));
        corpo.appendChild(img);
    }

    // Só o admin vê os botões de gerenciar. Os amigos só visualizam.
    if (ehAdmin) {
        const acoes = criar('div', 'tarefa-acoes');
        acoes.appendChild(botaoIcone('lapis', 'Editar atividade', '', () => abrirModal(ativ)));
        acoes.appendChild(botaoIcone('lixeira', 'Excluir atividade', 'perigo', () => deletarAtividade(ativ.id)));
        corpo.appendChild(acoes);
    }

    card.appendChild(corpo);
    return card;
}

function renderizarAtividades() {
    listaAtividades.replaceChildren();
    atividades.sort((a, b) => (a.prazo || '').localeCompare(b.prazo || ''));

    if (atividades.length === 0) {
        listaAtividades.appendChild(estadoVazio());
        return;
    }

    const animar = !jaDesenhou;
    let indice = 0;

    GRUPOS.forEach(grupo => {
        const itens = atividades.filter(a => grupo.testa(diasAte(a.prazo)));
        if (itens.length === 0) return;

        const secao = criar('section', `grupo grupo-${grupo.chave}`);
        const cabecalho = criar('div', 'grupo-cab');
        cabecalho.appendChild(criar('h2', '', grupo.titulo));
        cabecalho.appendChild(criar('span', 'contagem', String(itens.length)));
        secao.appendChild(cabecalho);

        itens.forEach(ativ => secao.appendChild(criarCartao(ativ, indice++, animar)));
        listaAtividades.appendChild(secao);
    });

    jaDesenhou = true;
}

async function deletarAtividade(id) {
    if (!confirm("Tem certeza que deseja excluir esta atividade?")) return;
    try {
        await deleteDoc(doc(db, "atividades", id));
    } catch (erro) {
        console.error("Erro ao excluir: ", erro);
        alert("Erro ao excluir. Você está logado como administrador?");
    }
}

// ============================================================
// IMAGEM: reduz e comprime antes de salvar
// ============================================================
function comprimirImagem(arquivo, larguraMax = 900) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        leitor.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error("Esse arquivo não é uma imagem válida."));
            img.onload = () => {
                const escala = Math.min(1, larguraMax / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * escala);
                canvas.height = Math.round(img.height * escala);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

                let qualidade = 0.7;
                let dados = canvas.toDataURL('image/jpeg', qualidade);
                while (dados.length > LIMITE_IMAGEM_CHARS && qualidade > 0.3) {
                    qualidade -= 0.1;
                    dados = canvas.toDataURL('image/jpeg', qualidade);
                }
                if (dados.length > LIMITE_IMAGEM_CHARS) {
                    reject(new Error("Imagem muito grande. Escolha uma menor."));
                } else {
                    resolve(dados);
                }
            };
            img.src = leitor.result;
        };
        leitor.readAsDataURL(arquivo);
    });
}

// ============================================================
// SALVAR (nova ou editada)
// ============================================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSalvar = document.querySelector('.btn-salvar');
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";

    try {
        const dados = {
            titulo: document.getElementById('titulo').value.trim(),
            materiaId: parseInt(document.getElementById('materia').value),
            prazo: document.getElementById('prazo').value,
            descricao: document.getElementById('descricao').value.trim()
        };

        const arquivoImg = document.getElementById('imagem').files[0];
        const imagem = arquivoImg ? await comprimirImagem(arquivoImg) : null;

        if (editandoId) {
            // Na edição, só troca a imagem se uma nova foi escolhida.
            if (imagem) dados.imagem = imagem;
            await updateDoc(doc(db, "atividades", editandoId), dados);
        } else {
            await addDoc(collection(db, "atividades"), { ...dados, imagem: imagem });
        }

        fecharModal();
    } catch (erro) {
        console.error("Erro ao salvar: ", erro);
        alert(erro.message || "Erro ao salvar a atividade.");
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar Atividade";
    }
});

// ============================================================
// QUEM ESTÁ LOGADO DECIDE O QUE APARECE
// ============================================================
function mostrarUsuario(nome, admin) {
    spanUsuario.replaceChildren(criar('span', 'usuario-nome', nome));
    if (admin) spanUsuario.appendChild(criar('span', 'selo-admin', 'admin'));
    spanUsuario.hidden = false;
}

onAuthStateChanged(auth, (user) => {
    if (cancelarEscuta) {
        cancelarEscuta();
        cancelarEscuta = null;
    }

    if (!user) {
        // Deslogado: esconde tudo e mostra o login.
        ehAdmin = false;
        atividades = [];
        jaDesenhou = false;
        limparCache();
        listaAtividades.replaceChildren();
        areaApp.hidden = true;
        spanUsuario.hidden = true;
        btnSair.hidden = true;
        btnNova.hidden = true;
        telaLogin.hidden = false;
        fecharModal();
        return;
    }

    ehAdmin = user.uid === ADMIN_UID;
    if (ADMIN_UID === "COLE_AQUI_O_UID_DO_ADMIN") {
        console.warn("Cole o UID do admin no arquivo config-admin.js.");
    }

    telaLogin.hidden = true;
    areaApp.hidden = false;
    btnSair.hidden = false;
    btnNova.hidden = !ehAdmin;
    mostrarUsuario(user.email.split('@')[0], ehAdmin);

    // Mostra o cache na hora (sem animar) e depois o Firebase atualiza em tempo real.
    atividades = lerCache();
    if (atividades.length > 0) {
        jaDesenhou = true; // antes de desenhar, para o cache não animar
        renderizarAtividades();
    }
    cancelarEscuta = escutarAtividades();
});
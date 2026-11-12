import {
    db, auth,
    collection, addDoc, doc, deleteDoc, updateDoc, onSnapshot, serverTimestamp,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from './firebase-config.js';
import { ADMIN_UID } from './config-admin.js';
import {
    MATERIAS, corDaMateria, perfis, aoMudarPerfis, abrirPerfil,
    criar, icone, trocarIcone, criarAvatar, tempoMs, tempoRelativo
} from './util.js';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

// O Firebase só aceita login com e-mail. Para o usuário digitar apenas o nome,
// o site monta um e-mail interno (usuario@agenda-escolar.app). Ele não precisa existir.
const DOMINIO_INTERNO = "agenda-escolar.app";

// O documento do Firestore aceita ~1 MB. A imagem vira texto (base64) e cresce ~33%,
// então limitamos o texto final em vez do tamanho do arquivo original.
const LIMITE_IMAGEM_CHARS = 700000;

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
const filtros = document.getElementById('filtros-agenda');
const btnTema = document.getElementById('btn-tema');
const metaTema = document.getElementById('meta-tema');

const telaLogin = document.getElementById('tela-login');
const formLogin = document.getElementById('form-login');
const inputUsuario = document.getElementById('login-usuario');
const btnEntrar = document.getElementById('btn-entrar');
const btnCriarConta = document.getElementById('btn-criar-conta');
const msgLogin = document.getElementById('login-msg');
const areaApp = document.getElementById('area-app');
const btnSair = document.getElementById('btn-sair');

const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('img');

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
        const senha = document.getElementById('login-senha').value;

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
MATERIAS.forEach(m => {
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
// DATAS
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
    if (dias === 0) return 'Vence hoje';
    if (dias === 1) return 'Vence amanhã';
    return `Em ${dias} dias`;
}

function classeUrgencia(dias) {
    if (dias === 0) return 'urgencia-hoje';
    if (dias === 1) return 'urgencia-amanha';
    return 'urgencia-futura';
}

function porPrazo(a, b) {
    return (a.prazo || '9999-99-99').localeCompare(b.prazo || '9999-99-99');
}

// ============================================================
// ESTADO DA AGENDA
// ============================================================
let atividades = [];
let ehAdmin = false;
let logado = false;
let cancelarEscuta = null;
let jaDesenhou = false;     // a animação de entrada só acontece na primeira vez
let filtroMateria = 0;      // 0 = todas

// "Feita" é só uma marcação sua, guardada neste aparelho.
let feitas = new Set();
try { feitas = new Set(JSON.parse(localStorage.getItem('atividadesFeitas')) || []); } catch (e) { /* começa vazio */ }

function salvarFeitas() {
    try { localStorage.setItem('atividadesFeitas', JSON.stringify([...feitas])); } catch (e) { /* ignora */ }
}

function alternarFeita(id) {
    if (feitas.has(id)) feitas.delete(id);
    else feitas.add(id);
    salvarFeitas();
    renderizarAtividades();
}

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
            atividades.push({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) });
        });

        // Primeiro desenha a tela: se o cache falhar, a lista continua atualizando.
        renderizarAtividades();

        // Cache sem as imagens (o localStorage tem só ~5 MB).
        try {
            const leve = atividades.map(({ imagem, criadoEm, ...resto }) => resto);
            localStorage.setItem('cacheAtividades', JSON.stringify(leve));
        } catch (e) { /* cache cheio ou indisponível: não é grave */ }
    }, (erro) => {
        console.error("Erro no Firebase: ", erro);
        listaAtividades.replaceChildren(
            criar('p', 'vazio', 'Não foi possível carregar as atividades. Entre de novo ou verifique a conexão.')
        );
    });
}

// ============================================================
// FEED DE ATIVIDADES (estilo Twitter)
// ============================================================
function estadoVazio(titulo, texto) {
    const caixa = criar('div', 'vazio');
    caixa.appendChild(icone('calendario-ok'));
    caixa.appendChild(criar('h2', '', titulo));
    caixa.appendChild(criar('p', '', texto));
    return caixa;
}

function botaoAcao(nomeIcone, texto, classes, aoClicar) {
    const botao = criar('button', `acao ${classes || ''}`.trim());
    botao.type = 'button';
    botao.appendChild(icone(nomeIcone));
    if (texto) botao.appendChild(criar('span', '', texto));
    botao.addEventListener('click', aoClicar);
    return botao;
}

function atualizarFiltros(visiveis) {
    filtros.replaceChildren();
    if (!logado || visiveis.length === 0) {
        filtros.hidden = true;
        return;
    }

    const ids = [...new Set(visiveis.map((a) => Number(a.materiaId)))];
    const nomeDe = (id) => (MATERIAS.find((m) => m.id === id) || { nome: 'Outra' }).nome;
    ids.sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'));

    if (filtroMateria !== 0 && !ids.includes(filtroMateria)) filtroMateria = 0;

    const adicionar = (id, rotulo) => {
        const chip = criar('button', 'chip-filtro', rotulo);
        chip.type = 'button';
        chip.setAttribute('aria-pressed', String(filtroMateria === id));
        chip.addEventListener('click', () => definirFiltro(id));
        filtros.appendChild(chip);
    };

    adicionar(0, 'Todas');
    ids.forEach((id) => adicionar(id, nomeDe(id)));
    filtros.hidden = false;
}

function definirFiltro(id) {
    filtroMateria = filtroMateria === id ? 0 : id;
    renderizarAtividades();
    window.scrollTo({ top: 0 });
}

function criarPost(ativ, indice, animar) {
    const mat = MATERIAS.find((m) => m.id == ativ.materiaId) || { id: 0, nome: "Desconhecida", professor: "-" };
    const dias = diasAte(ativ.prazo);
    const feita = feitas.has(ativ.id);

    // Quem "posta" as atividades é sempre o admin.
    const autor = perfis.get(ADMIN_UID);
    const nomeAutor = (autor && (autor.nomeExibicao || autor.usuario)) || 'Agenda';
    const handle = autor && autor.usuario ? `@${autor.usuario}` : '';

    const post = criar('article', `post ${classeUrgencia(dias)}${feita ? ' feita' : ''}`);
    post.style.setProperty('--materia', corDaMateria(ativ.materiaId));
    if (animar) {
        post.classList.add('entrada');
        post.style.setProperty('--i', Math.min(indice, 8));
    }

    // Coluna do avatar
    const colunaAvatar = criar('div', 'post-avatar');
    const avatar = criarAvatar(autor || { nomeExibicao: nomeAutor }, ADMIN_UID, 'medio');
    if (autor) {
        avatar.classList.add('clicavel');
        avatar.addEventListener('click', () => abrirPerfil(ADMIN_UID));
    }
    colunaAvatar.appendChild(avatar);
    post.appendChild(colunaAvatar);

    // Coluna do conteúdo
    const corpo = criar('div', 'post-corpo');

    const cab = criar('div', 'post-cab');
    const nome = criar('span', 'post-nome', nomeAutor);
    if (autor) {
        nome.classList.add('clicavel');
        nome.addEventListener('click', () => abrirPerfil(ADMIN_UID));
    }
    cab.appendChild(nome);
    if (handle) cab.appendChild(criar('span', 'post-handle', handle));
    const quando = tempoMs(ativ.criadoEm);
    if (quando) cab.appendChild(criar('span', 'post-tempo', `· ${tempoRelativo(quando)}`));
    corpo.appendChild(cab);

    corpo.appendChild(criar('h3', 'post-titulo', ativ.titulo));
    if (ativ.descricao) corpo.appendChild(criar('p', 'post-texto', ativ.descricao));

    // #Matéria (clicar filtra o feed) e professor
    const tags = criar('div', 'post-tags');
    const hashtag = criar('button', 'hashtag', `#${mat.nome.replace(/\s+/g, '')}`);
    hashtag.type = 'button';
    hashtag.title = `Ver só ${mat.nome}`;
    hashtag.addEventListener('click', () => definirFiltro(Number(ativ.materiaId)));
    tags.appendChild(hashtag);
    const prof = criar('span', 'post-prof');
    prof.appendChild(icone('usuario'));
    prof.appendChild(document.createTextNode(mat.professor));
    tags.appendChild(prof);
    corpo.appendChild(tags);

    if (ativ.imagem && ativ.imagem.startsWith('data:image/')) {
        const img = criar('img', 'post-img');
        img.src = ativ.imagem;
        img.alt = `Imagem da atividade ${ativ.titulo}`;
        img.loading = 'lazy';
        img.addEventListener('click', () => abrirImagem(ativ.imagem, img.alt));
        corpo.appendChild(img);
    }

    // Caixa do prazo
    const prazo = criar('div', 'post-prazo');
    const iconePrazo = criar('span', 'prazo-icone');
    iconePrazo.appendChild(icone('calendario'));
    prazo.appendChild(iconePrazo);
    const textoPrazo = criar('div', 'prazo-texto');
    textoPrazo.appendChild(criar('span', 'prazo-rotulo', 'Entrega'));
    textoPrazo.appendChild(criar('span', 'prazo-data', ativ.prazo
        ? dataLocal(ativ.prazo).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
        : 'Sem data'));
    prazo.appendChild(textoPrazo);
    prazo.appendChild(criar('span', 'prazo-pill', textoSituacao(dias)));
    corpo.appendChild(prazo);

    // Ações
    const acoes = criar('div', 'post-acoes');
    const btnFeita = botaoAcao('feito', feita ? 'Feita' : 'Marcar como feita', feita ? 'ativa' : '', () => alternarFeita(ativ.id));
    btnFeita.setAttribute('aria-pressed', String(feita));
    acoes.appendChild(btnFeita);

    if (ehAdmin) {
        acoes.appendChild(criar('span', 'acao-espaco'));
        const btnEditar = botaoAcao('lapis', '', '', () => abrirModal(ativ));
        btnEditar.setAttribute('aria-label', 'Editar atividade');
        btnEditar.title = 'Editar atividade';
        acoes.appendChild(btnEditar);
        const btnExcluir = botaoAcao('lixeira', '', 'perigo', () => deletarAtividade(ativ.id));
        btnExcluir.setAttribute('aria-label', 'Excluir atividade');
        btnExcluir.title = 'Excluir atividade';
        acoes.appendChild(btnExcluir);
    }
    corpo.appendChild(acoes);

    post.appendChild(corpo);
    return post;
}

function renderizarAtividades() {
    listaAtividades.replaceChildren();

    // Atividades com o prazo vencido somem sozinhas (a partir do dia seguinte).
    const visiveis = atividades.filter((a) => diasAte(a.prazo) >= 0).sort(porPrazo);
    const vencidas = atividades.filter((a) => diasAte(a.prazo) < 0);

    atualizarFiltros(visiveis);

    const mostradas = filtroMateria === 0
        ? visiveis
        : visiveis.filter((a) => Number(a.materiaId) === filtroMateria);

    if (mostradas.length === 0) {
        listaAtividades.appendChild(estadoVazio(
            'Nada pendente',
            ehAdmin
                ? 'Toque em "+" para publicar a primeira atividade.'
                : 'Quando houver atividades, elas aparecem aqui.'
        ));
    } else {
        const animar = !jaDesenhou;
        mostradas.forEach((ativ, i) => listaAtividades.appendChild(criarPost(ativ, i, animar)));
        jaDesenhou = true;
    }

    // Só o admin vê o aviso para limpar do banco as vencidas (que já estão ocultas para todos).
    if (ehAdmin && vencidas.length > 0) {
        const caixa = criar('div', 'limpeza');
        caixa.appendChild(criar('p', '',
            `${vencidas.length} atividade${vencidas.length > 1 ? 's vencidas estão ocultas' : ' vencida está oculta'}.`));
        const btn = criar('button', 'btn btn-secundario btn-pequeno', 'Apagar do banco');
        btn.type = 'button';
        btn.addEventListener('click', () => apagarVencidas(vencidas));
        caixa.appendChild(btn);
        listaAtividades.appendChild(caixa);
    }
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

async function apagarVencidas(lista) {
    if (!confirm(`Apagar ${lista.length} atividade(s) vencida(s) do banco? Isso não pode ser desfeito.`)) return;
    try {
        await Promise.all(lista.map((a) => deleteDoc(doc(db, "atividades", a.id))));
    } catch (erro) {
        console.error("Erro ao apagar vencidas: ", erro);
        alert("Não foi possível apagar todas. Tente de novo.");
    }
}

// Quando vira o dia (ou o app volta para a tela), o que venceu desaparece.
function agendarViradaDoDia() {
    const agora = new Date();
    const proxima = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 0, 0, 5);
    setTimeout(() => {
        if (logado) renderizarAtividades();
        agendarViradaDoDia();
    }, proxima - agora);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && logado) renderizarAtividades();
});

agendarViradaDoDia();

// O nome e a foto do admin vêm do perfil; quando o perfil carrega ou muda, redesenha.
aoMudarPerfis(() => {
    if (logado && atividades.length > 0) renderizarAtividades();
});

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
            await addDoc(collection(db, "atividades"), {
                ...dados,
                imagem: imagem,
                criadoEm: serverTimestamp()
            });
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
onAuthStateChanged(auth, (user) => {
    if (cancelarEscuta) {
        cancelarEscuta();
        cancelarEscuta = null;
    }

    if (!user) {
        // Deslogado: esconde tudo e mostra o login.
        logado = false;
        ehAdmin = false;
        atividades = [];
        jaDesenhou = false;
        filtroMateria = 0;
        limparCache();
        listaAtividades.replaceChildren();
        filtros.replaceChildren();
        filtros.hidden = true;
        areaApp.hidden = true;
        btnSair.hidden = true;
        btnNova.hidden = true;
        telaLogin.hidden = false;
        fecharModal();
        return;
    }

    logado = true;
    ehAdmin = user.uid === ADMIN_UID;
    if (ADMIN_UID === "COLE_AQUI_O_UID_DO_ADMIN") {
        console.warn("Cole o UID do admin no arquivo config-admin.js.");
    }

    telaLogin.hidden = true;
    areaApp.hidden = false;
    btnSair.hidden = false;
    btnNova.hidden = !ehAdmin;

    // Mostra o cache na hora (sem animar) e depois o Firebase atualiza em tempo real.
    atividades = lerCache();
    if (atividades.length > 0) {
        jaDesenhou = true; // antes de desenhar, para o cache não animar
        renderizarAtividades();
    }
    cancelarEscuta = escutarAtividades();
});
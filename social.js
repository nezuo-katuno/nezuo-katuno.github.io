import {
    db, auth,
    collection, addDoc, doc, deleteDoc, updateDoc, setDoc, getDoc, onSnapshot,
    query, orderBy, limit, where, serverTimestamp,
    onAuthStateChanged, signOut
} from './firebase-config.js';
import { ADMIN_UID } from './config-admin.js';
import {
    MATERIAS, CORES_PERFIL, COR_PADRAO, corDaMateria, corValida,
    perfis, definirPerfis, aoMudarPerfis,
    criar, icone, botaoIcone, criarAvatar, tempoMs
} from './util.js';

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const MAX_NOME = 30;                 // caracteres do nome de exibição
const MAX_BIO = 160;                 // caracteres da biografia
const MAX_MENSAGEM = 500;            // caracteres por mensagem
const MENSAGENS_NA_TELA = 60;        // quantas mensagens recentes o chat carrega
const LIMITE_FOTO_CHARS = 60000;     // tamanho máximo da foto (em texto) no Firestore
const LIMITE_BANNER_CHARS = 180000;  // tamanho máximo do banner (em texto) no Firestore

// ============================================================
// ELEMENTOS
// ============================================================
const barraAbas = document.getElementById('barra-abas');
const botoesAba = document.querySelectorAll('.aba');
const badgeChat = document.getElementById('badge-chat');
const badgePessoas = document.getElementById('badge-pessoas');
const avatarCabecalho = document.getElementById('btn-perfil-cabecalho');

const areaChat = document.getElementById('area-chat');
const listaChat = document.getElementById('lista-chat');
const formChat = document.getElementById('form-chat');
const inputChat = document.getElementById('chat-texto');

const areaPessoas = document.getElementById('area-pessoas');
const buscaPessoas = document.getElementById('busca-pessoas');
const listaPessoas = document.getElementById('lista-pessoas');

const areaPerfil = document.getElementById('area-perfil');
const bannerPerfil = document.getElementById('perfil-banner');
const btnTrocarBanner = document.getElementById('btn-trocar-banner');
const inputBanner = document.getElementById('input-banner');
const btnRemoverBanner = document.getElementById('btn-remover-banner');
const boxAvatarPerfil = document.getElementById('perfil-avatar');
const btnTrocarFoto = document.getElementById('btn-trocar-foto');
const inputFoto = document.getElementById('input-foto');
const btnRemoverFoto = document.getElementById('btn-remover-foto');
const previaNome = document.getElementById('perfil-nome-previa');
const previaUsuario = document.getElementById('perfil-usuario');
const previaBio = document.getElementById('perfil-bio-previa');
const previaChips = document.getElementById('perfil-chips');
const formPerfil = document.getElementById('form-perfil');
const inputNome = document.getElementById('perfil-nome');
const inputBio = document.getElementById('perfil-bio');
const bioContador = document.getElementById('bio-contador');
const selectMateriaFav = document.getElementById('perfil-materia');
const paletaCores = document.getElementById('paleta-cores');
const perfilMsg = document.getElementById('perfil-msg');
const btnSalvarPerfil = document.getElementById('btn-salvar-perfil');
const btnSairPerfil = document.getElementById('btn-sair-perfil');

const sheetPerfil = document.getElementById('sheet-perfil');
const sheetConteudo = document.getElementById('sheet-conteudo');
const sheetFechar = document.getElementById('sheet-fechar');

// ============================================================
// ESTADO
// ============================================================
let euUid = null;
let euAdmin = false;
let abaAtual = 'agenda';
let mensagens = [];              // mais antigas primeiro
let amizades = new Map();        // uid da outra pessoa -> { id, de, para, status }
let cancelar = [];               // funções para parar os "ouvintes" do Firestore
let rolarProximo = false;        // forçar rolagem até o fim após enviar
let ultimoEnvio = 0;

// Edição do próprio perfil (undefined = sem mudança)
let fotoPendente;
let bannerPendente;
let corPendente;
let formSujo = false;            // true enquanto a pessoa mexe no formulário
let meuBanner = '';

// Banners ficam numa coleção à parte e são buscados só quando alguém abre um perfil.
const bannerCache = new Map();   // uid -> { imagem, buscadoEm }
let sheetUid = null;
let sheetBanner = '';

// ============================================================
// ABAS
// ============================================================
function mostrarAba(nome) {
    abaAtual = nome;
    document.body.dataset.aba = nome;
    areaChat.hidden = nome !== 'chat';
    areaPessoas.hidden = nome !== 'pessoas';
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
    if (nome === 'pessoas') renderizarPessoas();
    if (nome === 'perfil') renderizarPerfil();
}

botoesAba.forEach((b) => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));
avatarCabecalho.addEventListener('click', () => mostrarAba('perfil'));
document.body.dataset.aba = 'agenda';

// ============================================================
// IMAGENS: cortar, reduzir e comprimir para caber no Firestore
// ============================================================
function prepararImagem(arquivo, largura, altura, limiteChars) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
        leitor.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Esse arquivo não é uma imagem válida.'));
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = largura;
                canvas.height = altura;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; // fundo para imagens com transparência
                ctx.fillRect(0, 0, largura, altura);

                // Corta no centro para preencher a área sem deformar.
                const escala = Math.max(largura / img.width, altura / img.height);
                const cw = largura / escala;
                const ch = altura / escala;
                ctx.drawImage(img, (img.width - cw) / 2, (img.height - ch) / 2, cw, ch, 0, 0, largura, altura);

                let qualidade = 0.85;
                let dados = canvas.toDataURL('image/jpeg', qualidade);
                while (dados.length > limiteChars && qualidade > 0.4) {
                    qualidade -= 0.1;
                    dados = canvas.toDataURL('image/jpeg', qualidade);
                }
                if (dados.length > limiteChars) {
                    reject(new Error('Imagem muito pesada. Escolha outra.'));
                } else {
                    resolve(dados);
                }
            };
            img.src = leitor.result;
        };
        leitor.readAsDataURL(arquivo);
    });
}

// Pinta o banner: a imagem, ou um degradê com a cor do perfil.
function pintarBanner(el, banner, cor) {
    el.style.backgroundColor = cor;
    if (banner && banner.startsWith('data:image/')) {
        el.style.backgroundImage = `url("${banner}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
    } else {
        el.style.backgroundImage = `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor} 45%, #0b0e1f))`;
        el.style.backgroundSize = '';
        el.style.backgroundPosition = '';
    }
}

function corDoPerfil(perfil) {
    return perfil && corValida(perfil.cor) ? perfil.cor : COR_PADRAO;
}

function chipMateriaFavorita(perfil) {
    const mat = MATERIAS.find((m) => m.id === Number(perfil && perfil.materiaFavorita));
    if (!mat) return null;
    const chip = criar('span', 'chip-materia', `Matéria favorita: ${mat.nome}`);
    chip.style.setProperty('--materia', corDaMateria(mat.id));
    return chip;
}

// ============================================================
// BANNERS (buscados sob demanda)
// ============================================================
function bannerEmCache(uid) {
    const guardado = bannerCache.get(uid);
    return guardado ? guardado.imagem : '';
}

async function obterBanner(uid) {
    const perfil = perfis.get(uid);
    const atualizado = tempoMs(perfil && perfil.atualizadoEm);
    const guardado = bannerCache.get(uid);
    if (guardado && guardado.buscadoEm >= atualizado) return guardado.imagem;
    try {
        const snap = await getDoc(doc(db, 'banners', uid));
        const imagem = snap.exists() ? (snap.data().imagem || '') : '';
        bannerCache.set(uid, { imagem, buscadoEm: Date.now() });
        return imagem;
    } catch (erro) {
        console.error('Erro ao buscar o banner:', erro);
        return guardado ? guardado.imagem : '';
    }
}

// ============================================================
// MEU PERFIL
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
            bio: '',
            cor: COR_PADRAO,
            materiaFavorita: 0,
            atualizadoEm: serverTimestamp()
        });
    }
}

function mensagemPerfil(texto, ok) {
    perfilMsg.textContent = texto;
    perfilMsg.classList.toggle('ok', Boolean(ok));
}

function renderizarCabecalho() {
    avatarCabecalho.replaceChildren(criarAvatar(perfis.get(euUid), euUid));
}

function construirPaleta() {
    CORES_PERFIL.forEach((cor) => {
        const b = criar('button', 'cor-bolinha');
        b.type = 'button';
        b.style.background = cor;
        b.dataset.cor = cor;
        b.setAttribute('aria-label', `Cor ${cor}`);
        b.addEventListener('click', () => {
            corPendente = cor;
            formSujo = true;
            renderizarPerfil();
        });
        paletaCores.appendChild(b);
    });
}

function construirSelectMateria() {
    const nenhuma = document.createElement('option');
    nenhuma.value = '0';
    nenhuma.textContent = 'Nenhuma';
    selectMateriaFav.appendChild(nenhuma);
    MATERIAS.forEach((m) => {
        const op = document.createElement('option');
        op.value = String(m.id);
        op.textContent = m.nome;
        selectMateriaFav.appendChild(op);
    });
}

function renderizarPerfil() {
    const meu = perfis.get(euUid);
    if (!meu) return;

    const cor = corPendente !== undefined ? corPendente : corDoPerfil(meu);
    const fotoAtual = fotoPendente !== undefined ? fotoPendente : meu.foto;
    const bannerAtual = bannerPendente !== undefined ? bannerPendente : meuBanner;

    // Não sobrescreve o que a pessoa está digitando.
    if (!formSujo) {
        inputNome.value = meu.nomeExibicao || '';
        inputBio.value = meu.bio || '';
        selectMateriaFav.value = String(meu.materiaFavorita || 0);
    }

    pintarBanner(bannerPerfil, bannerAtual, cor);
    boxAvatarPerfil.replaceChildren(criarAvatar({ ...meu, foto: fotoAtual }, euUid, 'grande'));

    // Prévia do jeito que os outros vão ver
    previaNome.replaceChildren(document.createTextNode(inputNome.value.trim() || meu.nomeExibicao || meu.usuario));
    if (euAdmin) previaNome.appendChild(criar('span', 'selo-admin', 'admin'));
    previaUsuario.textContent = `@${meu.usuario}`;
    previaBio.textContent = inputBio.value.trim();
    previaBio.hidden = !inputBio.value.trim();

    previaChips.replaceChildren();
    const chip = chipMateriaFavorita({ materiaFavorita: selectMateriaFav.value });
    if (chip) previaChips.appendChild(chip);
    previaChips.hidden = !chip;

    bioContador.textContent = `${Array.from(inputBio.value).length}/${MAX_BIO}`;

    paletaCores.querySelectorAll('.cor-bolinha').forEach((b) => {
        const ativa = b.dataset.cor.toLowerCase() === cor.toLowerCase();
        b.classList.toggle('ativa', ativa);
        b.setAttribute('aria-pressed', String(ativa));
    });

    btnRemoverFoto.hidden = !fotoAtual;
    btnRemoverBanner.hidden = !bannerAtual;
}

[inputNome, inputBio, selectMateriaFav].forEach((campo) => {
    campo.addEventListener('input', () => {
        formSujo = true;
        renderizarPerfil();
    });
});

btnTrocarFoto.addEventListener('click', () => inputFoto.click());
btnTrocarBanner.addEventListener('click', () => inputBanner.click());

inputFoto.addEventListener('change', async () => {
    const arquivo = inputFoto.files[0];
    inputFoto.value = '';
    if (!arquivo) return;
    try {
        fotoPendente = await prepararImagem(arquivo, 192, 192, LIMITE_FOTO_CHARS);
        formSujo = true;
        renderizarPerfil();
        mensagemPerfil('Foto escolhida. Toque em "Salvar perfil" para confirmar.', true);
    } catch (erro) {
        mensagemPerfil(erro.message, false);
    }
});

inputBanner.addEventListener('change', async () => {
    const arquivo = inputBanner.files[0];
    inputBanner.value = '';
    if (!arquivo) return;
    try {
        bannerPendente = await prepararImagem(arquivo, 720, 240, LIMITE_BANNER_CHARS);
        formSujo = true;
        renderizarPerfil();
        mensagemPerfil('Banner escolhido. Toque em "Salvar perfil" para confirmar.', true);
    } catch (erro) {
        mensagemPerfil(erro.message, false);
    }
});

btnRemoverFoto.addEventListener('click', () => {
    fotoPendente = '';
    formSujo = true;
    renderizarPerfil();
    mensagemPerfil('Foto removida. Toque em "Salvar perfil" para confirmar.', true);
});

btnRemoverBanner.addEventListener('click', () => {
    bannerPendente = '';
    formSujo = true;
    renderizarPerfil();
    mensagemPerfil('Banner removido. Toque em "Salvar perfil" para confirmar.', true);
});

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
    const bio = inputBio.value.trim();
    if (Array.from(bio).length > MAX_BIO) {
        mensagemPerfil(`A biografia pode ter até ${MAX_BIO} caracteres.`, false);
        return;
    }

    btnSalvarPerfil.disabled = true;
    btnSalvarPerfil.textContent = 'Salvando...';
    try {
        // O banner vai primeiro, para o carimbo de atualização do perfil ser sempre mais novo.
        if (bannerPendente !== undefined) {
            if (bannerPendente === '') {
                await deleteDoc(doc(db, 'banners', euUid));
            } else {
                await setDoc(doc(db, 'banners', euUid), { imagem: bannerPendente });
            }
            meuBanner = bannerPendente;
            bannerCache.set(euUid, { imagem: bannerPendente, buscadoEm: Date.now() + 60000 });
        }

        await setDoc(doc(db, 'perfis', euUid), {
            usuario: meu.usuario,
            nomeExibicao: nome,
            foto: fotoPendente !== undefined ? fotoPendente : (meu.foto || ''),
            bio,
            cor: corPendente !== undefined ? corPendente : corDoPerfil(meu),
            materiaFavorita: Number(selectMateriaFav.value) || 0,
            atualizadoEm: serverTimestamp()
        });

        fotoPendente = undefined;
        bannerPendente = undefined;
        corPendente = undefined;
        formSujo = false;
        mensagemPerfil('Perfil salvo!', true);
    } catch (erro) {
        console.error('Erro ao salvar perfil:', erro);
        mensagemPerfil('Não foi possível salvar. Verifique a conexão e as regras do Firestore.', false);
    } finally {
        btnSalvarPerfil.disabled = false;
        btnSalvarPerfil.textContent = 'Salvar perfil';
        renderizarPerfil();
    }
});

btnSairPerfil.addEventListener('click', () => signOut(auth));

// ============================================================
// AMIZADES
// ============================================================
function idPar(a, b) {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
}

// 'eu' | 'nenhuma' | 'enviado' | 'recebido' | 'amigos'
function relacao(uid) {
    if (uid === euUid) return 'eu';
    const a = amizades.get(uid);
    if (!a) return 'nenhuma';
    if (a.status === 'aceita') return 'amigos';
    return a.de === euUid ? 'enviado' : 'recebido';
}

async function enviarPedido(uid) {
    try {
        await setDoc(doc(db, 'amizades', idPar(euUid, uid)), {
            de: euUid,
            para: uid,
            participantes: [euUid, uid],
            status: 'pendente',
            criadoEm: serverTimestamp()
        });
    } catch (erro) {
        console.error('Erro ao enviar pedido:', erro);
        alert('Não foi possível enviar o pedido de amizade.');
    }
}

async function aceitarPedido(uid) {
    try {
        await updateDoc(doc(db, 'amizades', idPar(euUid, uid)), {
            status: 'aceita',
            atualizadoEm: serverTimestamp()
        });
    } catch (erro) {
        console.error('Erro ao aceitar pedido:', erro);
        alert('Não foi possível aceitar o pedido.');
    }
}

async function removerRelacao(uid, confirmacao) {
    if (confirmacao && !confirm(confirmacao)) return;
    try {
        await deleteDoc(doc(db, 'amizades', idPar(euUid, uid)));
    } catch (erro) {
        console.error('Erro ao remover amizade/pedido:', erro);
        alert('Não foi possível concluir. Tente de novo.');
    }
}

// Botões conforme a situação entre mim e a pessoa. "compacto" é para as linhas da lista.
function criarBotoesAmizade(uid, compacto) {
    const extra = compacto ? ' btn-pequeno' : '';
    const botao = (texto, estilo, acao) => {
        const b = criar('button', `btn btn-${estilo}${extra}`, texto);
        b.type = 'button';
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            acao();
        });
        return b;
    };

    switch (relacao(uid)) {
        case 'nenhuma':
            return [botao('Adicionar amigo', 'primario', () => enviarPedido(uid))];
        case 'enviado': {
            const b = botao(compacto ? 'Pendente' : 'Pedido enviado', 'secundario', () => removerRelacao(uid, 'Cancelar o pedido de amizade?'));
            b.title = 'Toque para cancelar o pedido';
            return [b];
        }
        case 'recebido':
            return [
                botao('Aceitar', 'primario', () => aceitarPedido(uid)),
                botao('Recusar', 'secundario', () => removerRelacao(uid))
            ];
        case 'amigos':
            return compacto ? [] : [botao('Amigos', 'secundario', () => removerRelacao(uid, 'Desfazer a amizade?'))];
        case 'eu':
            return compacto ? [] : [botao('Editar perfil', 'secundario', () => {
                fecharSheet();
                mostrarAba('perfil');
            })];
        default:
            return [];
    }
}

function pedidosRecebidos() {
    return [...amizades.values()].filter((a) => a.status === 'pendente' && a.para === euUid).length;
}

function atualizarBadgePessoas() {
    const n = pedidosRecebidos();
    badgePessoas.hidden = n === 0;
    badgePessoas.textContent = n > 9 ? '9+' : String(n);
}

// ============================================================
// ABA PESSOAS
// ============================================================
function nomeDe(perfil) {
    return (perfil && (perfil.nomeExibicao || perfil.usuario)) || 'Usuário';
}

function criarLinhaPessoa(uid, perfil) {
    const linha = criar('div', 'pessoa');
    linha.tabIndex = 0;
    linha.setAttribute('role', 'button');
    linha.setAttribute('aria-label', `Ver perfil de ${nomeDe(perfil)}`);

    linha.appendChild(criarAvatar(perfil, uid, 'medio'));

    const info = criar('div', 'pessoa-info');
    const nome = criar('span', 'pessoa-nome');
    nome.appendChild(criar('span', 'pessoa-nome-texto', nomeDe(perfil)));
    if (uid === ADMIN_UID) nome.appendChild(criar('span', 'selo-admin', 'admin'));
    info.appendChild(nome);
    info.appendChild(criar('span', 'pessoa-usuario', `@${perfil.usuario || ''}`));
    linha.appendChild(info);

    const acoes = criar('div', 'pessoa-acoes');
    criarBotoesAmizade(uid, true).forEach((b) => acoes.appendChild(b));
    linha.appendChild(acoes);

    linha.addEventListener('click', () => abrirSheetPerfil(uid));
    linha.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target === linha) abrirSheetPerfil(uid);
    });
    return linha;
}

function renderizarPessoas() {
    listaPessoas.replaceChildren();
    if (!euUid) return;

    const termo = buscaPessoas.value.trim().toLowerCase();
    const todas = [...perfis.entries()]
        .filter(([uid]) => uid !== euUid)
        .filter(([, p]) => !termo
            || nomeDe(p).toLowerCase().includes(termo)
            || (p.usuario || '').toLowerCase().includes(termo))
        .sort(([, a], [, b]) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'));

    const recebidos = todas.filter(([uid]) => relacao(uid) === 'recebido');
    const amigos = todas.filter(([uid]) => relacao(uid) === 'amigos');
    const outros = todas.filter(([uid]) => ['nenhuma', 'enviado'].includes(relacao(uid)));

    const secao = (titulo, itens) => {
        if (itens.length === 0) return;
        const bloco = criar('section', 'pessoas-secao');
        const cab = criar('h2', 'pessoas-titulo');
        cab.appendChild(document.createTextNode(titulo));
        cab.appendChild(criar('span', 'contagem', String(itens.length)));
        bloco.appendChild(cab);
        itens.forEach(([uid, p]) => bloco.appendChild(criarLinhaPessoa(uid, p)));
        listaPessoas.appendChild(bloco);
    };

    secao('Pedidos de amizade', recebidos);
    secao('Amigos', amigos);
    secao(termo ? 'Resultados' : 'Todas as pessoas', outros);

    if (todas.length === 0) {
        listaPessoas.appendChild(criar('p', 'pessoas-vazio',
            termo ? 'Ninguém encontrado com esse nome.' : 'Ainda não há outras pessoas por aqui. Chame os amigos para criar conta!'));
    }
}

buscaPessoas.addEventListener('input', renderizarPessoas);

// ============================================================
// PERFIL DE OUTRAS PESSOAS (folha que sobe de baixo)
// ============================================================
function sheetAberto() {
    return !sheetPerfil.classList.contains('oculto');
}

function renderizarSheet() {
    const perfil = perfis.get(sheetUid);
    if (!perfil) {
        fecharSheet();
        return;
    }

    sheetConteudo.replaceChildren();

    const banner = criar('div', 'pf-banner');
    pintarBanner(banner, sheetBanner, corDoPerfil(perfil));
    sheetConteudo.appendChild(banner);

    const topo = criar('div', 'pf-topo');
    const avatar = criar('div', 'pf-avatar');
    avatar.appendChild(criarAvatar(perfil, sheetUid, 'grande'));
    topo.appendChild(avatar);
    const acoes = criar('div', 'pf-acoes');
    criarBotoesAmizade(sheetUid, false).forEach((b) => acoes.appendChild(b));
    topo.appendChild(acoes);
    sheetConteudo.appendChild(topo);

    const info = criar('div', 'pf-info');
    const nome = criar('h2', 'pf-nome');
    nome.appendChild(document.createTextNode(nomeDe(perfil)));
    if (sheetUid === ADMIN_UID) nome.appendChild(criar('span', 'selo-admin', 'admin'));
    info.appendChild(nome);
    info.appendChild(criar('p', 'pf-usuario', `@${perfil.usuario || ''}`));
    if (perfil.bio) info.appendChild(criar('p', 'pf-bio', perfil.bio));

    const chip = chipMateriaFavorita(perfil);
    if (chip) {
        const chips = criar('div', 'pf-chips');
        chips.appendChild(chip);
        info.appendChild(chips);
    }
    sheetConteudo.appendChild(info);
}

async function abrirSheetPerfil(uid) {
    if (!perfis.get(uid)) return;
    sheetUid = uid;
    sheetBanner = bannerEmCache(uid);
    renderizarSheet();
    sheetPerfil.classList.remove('oculto');
    document.body.classList.add('sem-rolagem');
    sheetConteudo.scrollTop = 0;

    const banner = await obterBanner(uid);
    if (sheetUid === uid && sheetAberto()) {
        sheetBanner = banner;
        renderizarSheet();
    }
}

function fecharSheet() {
    sheetPerfil.classList.add('oculto');
    document.body.classList.remove('sem-rolagem');
    sheetUid = null;
}

sheetFechar.addEventListener('click', fecharSheet);
sheetPerfil.addEventListener('click', (e) => {
    if (e.target === sheetPerfil) fecharSheet();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetAberto()) fecharSheet();
});

// Qualquer parte do site (agenda, chat) pode pedir para abrir o perfil de alguém.
window.addEventListener('abrir-perfil', (e) => {
    if (euUid) abrirSheetPerfil(e.detail);
});

// ============================================================
// CHAT
// ============================================================
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

function msDaMensagem(m) {
    return tempoMs(m.criadoEm) || Date.now();
}

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

    const linha = criar('div', `msg${minha ? ' minha' : ''}${agrupada ? ' agrupada' : ''}`);

    if (!minha) {
        if (agrupada) {
            linha.appendChild(criar('span', 'msg-espaco'));
        } else {
            const av = criarAvatar(perfil, m.uid, 'pequeno');
            av.classList.add('clicavel');
            av.addEventListener('click', () => abrirSheetPerfil(m.uid));
            linha.appendChild(av);
        }
    }

    const corpo = criar('div', 'msg-corpo');
    if (!agrupada) {
        const cab = criar('div', 'msg-cab');
        if (!minha) {
            const nome = criar('span', 'msg-nome clicavel', nomeDe(perfil));
            nome.addEventListener('click', () => abrirSheetPerfil(m.uid));
            cab.appendChild(nome);
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
        const ms = msDaMensagem(m);

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
    const ultima = mensagens.length ? msDaMensagem(mensagens[mensagens.length - 1]) : Date.now();
    gravarChatVisto(ultima);
    badgeChat.hidden = true;
}

function atualizarNaoLidas() {
    if (abaAtual === 'chat') {
        marcarChatComoLido();
        return;
    }
    const visto = lerChatVisto();
    const n = mensagens.filter((m) => m.uid !== euUid && msDaMensagem(m) > visto).length;
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

// Quando os perfis mudam, tudo que mostra nomes e fotos é redesenhado.
aoMudarPerfis(() => {
    if (!euUid) return;
    renderizarCabecalho();
    renderizarPerfil();
    renderizarChat();
    renderizarPessoas();
    if (sheetAberto()) renderizarSheet();
});

function iniciarOuvintes() {
    // Primeira vez neste aparelho: nada conta como "não lido".
    if (lerChatVisto() === 0) gravarChatVisto(Date.now());

    cancelar.push(onSnapshot(collection(db, 'perfis'), (snapshot) => {
        const entradas = [];
        snapshot.forEach((d) => entradas.push([d.id, d.data({ serverTimestamps: 'estimate' })]));
        definirPerfis(entradas);
    }, (erro) => console.error('Erro nos perfis:', erro)));

    const consultaChat = query(
        collection(db, 'mensagens'),
        orderBy('criadoEm', 'desc'),
        limit(MENSAGENS_NA_TELA)
    );
    cancelar.push(onSnapshot(consultaChat, (snapshot) => {
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

    // Só as amizades e pedidos em que eu participo.
    const consultaAmizades = query(
        collection(db, 'amizades'),
        where('participantes', 'array-contains', euUid)
    );
    cancelar.push(onSnapshot(consultaAmizades, (snapshot) => {
        amizades = new Map();
        snapshot.forEach((d) => {
            const a = d.data();
            const outro = (a.participantes || []).find((u) => u !== euUid);
            if (outro) amizades.set(outro, { id: d.id, de: a.de, para: a.para, status: a.status });
        });
        atualizarBadgePessoas();
        renderizarPessoas();
        if (sheetAberto()) renderizarSheet();
    }, (erro) => console.error('Erro nas amizades:', erro)));
}

// ============================================================
// QUEM ESTÁ LOGADO
// ============================================================
construirPaleta();
construirSelectMateria();

onAuthStateChanged(auth, async (user) => {
    encerrarOuvintes();
    fecharSheet();

    if (!user) {
        euUid = null;
        euAdmin = false;
        definirPerfis([]);
        mensagens = [];
        amizades = new Map();
        bannerCache.clear();
        meuBanner = '';
        fotoPendente = undefined;
        bannerPendente = undefined;
        corPendente = undefined;
        formSujo = false;
        perfilMsg.textContent = '';
        buscaPessoas.value = '';
        barraAbas.hidden = true;
        avatarCabecalho.hidden = true;
        badgeChat.hidden = true;
        badgePessoas.hidden = true;
        listaChat.replaceChildren();
        listaPessoas.replaceChildren();
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

    // O meu banner é buscado uma vez (os dos outros, só quando alguém abre o perfil).
    obterBanner(user.uid).then((imagem) => {
        if (euUid !== user.uid) return;
        meuBanner = imagem;
        renderizarPerfil();
    });
});
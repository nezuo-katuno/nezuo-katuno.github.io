// util.js: coisas compartilhadas entre app.js (agenda) e social.js (perfil, chat, pessoas)

// ============================================================
// MATÉRIAS (edite aqui: só existe uma lista para o site todo)
// ============================================================
export const MATERIAS = [
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

// Cada matéria ganha sua própria cor (distribuída pelo círculo de cores).
export function corDaMateria(id) {
    return `hsl(${Math.round((Number(id) * 137.508) % 360)} 62% 46%)`;
}

// ============================================================
// CORES DE PERFIL
// ============================================================
export const COR_PADRAO = '#3050F8';
export const CORES_PERFIL = [
    '#3050F8', '#7048E8', '#D6336C', '#E8590C',
    '#2F9E44', '#0C8599', '#B8860B', '#495873'
];

export function corValida(cor) {
    return typeof cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cor);
}

// ============================================================
// PERFIS (um único mapa compartilhado: uid -> dados do perfil)
// ============================================================
export const perfis = new Map();
const ouvintesPerfis = new Set();

export function aoMudarPerfis(funcao) {
    ouvintesPerfis.add(funcao);
    return () => ouvintesPerfis.delete(funcao);
}

// Recebe uma lista de pares [uid, dados], troca o conteúdo do mapa e avisa quem está ouvindo.
export function definirPerfis(entradas) {
    perfis.clear();
    entradas.forEach(([uid, dados]) => perfis.set(uid, dados));
    ouvintesPerfis.forEach((funcao) => {
        try { funcao(); } catch (erro) { console.error('Erro ao atualizar perfis:', erro); }
    });
}

// Qualquer tela pede para abrir o perfil de alguém; o social.js escuta e mostra.
export function abrirPerfil(uid) {
    window.dispatchEvent(new CustomEvent('abrir-perfil', { detail: uid }));
}

// ============================================================
// CRIAR ELEMENTOS E ÍCONES
// ============================================================
const NS_SVG = 'http://www.w3.org/2000/svg';

export function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto; // textContent: nada digitado vira HTML/código
    return el;
}

export function icone(nome) {
    const svg = document.createElementNS(NS_SVG, 'svg');
    svg.setAttribute('class', 'icone');
    svg.setAttribute('aria-hidden', 'true');
    const uso = document.createElementNS(NS_SVG, 'use');
    uso.setAttribute('href', `#i-${nome}`);
    svg.appendChild(uso);
    return svg;
}

export function trocarIcone(botao, nome) {
    botao.querySelector('use').setAttribute('href', `#i-${nome}`);
}

export function botaoIcone(nomeIcone, rotulo, classesExtra, aoClicar) {
    const botao = criar('button', `btn-icone pequeno ${classesExtra || ''}`.trim());
    botao.type = 'button';
    botao.setAttribute('aria-label', rotulo);
    botao.title = rotulo;
    botao.appendChild(icone(nomeIcone));
    botao.addEventListener('click', aoClicar);
    return botao;
}

// ============================================================
// AVATARES
// ============================================================
function hash(texto) {
    let h = 0;
    for (const c of texto) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return h;
}

export function iniciais(nome) {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    const letras = partes.slice(0, 2).map((p) => Array.from(p)[0]);
    return (letras.join('') || '?').toUpperCase();
}

// Foto, ou as iniciais sobre uma cor própria de cada pessoa.
// tamanho: '', 'pequeno', 'medio' ou 'grande' (classes do CSS)
export function criarAvatar(perfil, uid, tamanho) {
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

// ============================================================
// TEMPO
// ============================================================
export function tempoMs(timestamp) {
    return timestamp && timestamp.toMillis ? timestamp.toMillis() : 0;
}

export function tempoRelativo(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'agora';
    const min = Math.floor(s / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} d`;
    return new Date(ms).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
}
import { db, collection, addDoc, doc, deleteDoc, onSnapshot } from './firebase-config.js';

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

const modal = document.getElementById('modal');
const btnNova = document.getElementById('btn-nova-atividade');
const btnFechar = document.querySelector('.fechar');
const form = document.getElementById('form-atividade');
const selectMateria = document.getElementById('materia');
const listaAtividades = document.getElementById('lista-atividades');
const btnTema = document.getElementById('btn-tema');

// --- SISTEMA DE TEMA (CLARO/ESCURO) ---
try {
    if (localStorage.getItem('tema') === 'escuro') {
        document.body.classList.add('dark-mode');
        btnTema.textContent = '☀️ Claro';
    }
} catch (e) { /* sem localStorage, segue sem lembrar o tema */ }

btnTema.onclick = () => {
    document.body.classList.toggle('dark-mode');
    const escuro = document.body.classList.contains('dark-mode');
    btnTema.textContent = escuro ? '☀️ Claro' : '🌙 Escuro';
    try {
        localStorage.setItem('tema', escuro ? 'escuro' : 'claro');
    } catch (e) { /* ignora */ }
};

// --- SELECT DE MATÉRIAS ---
materias.forEach(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.nome} (${m.professor})`;
    selectMateria.appendChild(option);
});

// --- MODAL ---
function abrirModal() {
    modal.classList.remove('oculto');
}

function fecharModal() {
    modal.classList.add('oculto');
    form.reset();
}

btnNova.onclick = abrirModal;
btnFechar.onclick = fecharModal;
modal.addEventListener('click', (e) => {
    if (e.target === modal) fecharModal(); // clicar fora fecha
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('oculto')) fecharModal();
});

// --- CACHE LOCAL PARA CARREGAMENTO INSTANTÂNEO ---
let atividades = [];
try {
    atividades = JSON.parse(localStorage.getItem('cacheAtividades')) || [];
} catch (e) {
    atividades = [];
}
if (atividades.length > 0) renderizarAtividades();

// --- ESCUTAR FIREBASE EM TEMPO REAL ---
function escutarAtividades() {
    onSnapshot(collection(db, "atividades"), (snapshot) => {
        atividades = [];
        snapshot.forEach((d) => {
            atividades.push({ id: d.id, ...d.data() });
        });

        // Primeiro desenha a tela: se o cache falhar, a lista continua atualizando.
        renderizarAtividades();

        // O cache fica sem as imagens: o localStorage tem só ~5 MB e as imagens
        // (em base64) estouravam esse limite, o que travava a atualização da tela.
        try {
            const leve = atividades.map(({ imagem, ...resto }) => resto);
            localStorage.setItem('cacheAtividades', JSON.stringify(leve));
        } catch (e) { /* cache cheio ou indisponível: não é grave */ }
    }, (erro) => {
        console.error("Erro no Firebase: ", erro);
    });
}

function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto; // textContent: nada digitado vira HTML/código
    return el;
}

function formatarData(prazo) {
    return prazo ? prazo.split('-').reverse().join('/') : '-';
}

function renderizarAtividades() {
    listaAtividades.replaceChildren();
    atividades.sort((a, b) => (a.prazo || '').localeCompare(b.prazo || ''));

    atividades.forEach(ativ => {
        const mat = materias.find(m => m.id == ativ.materiaId) || { nome: "Desconhecida", professor: "-" };

        const card = criar('div', 'card');
        card.appendChild(criar('h3', '', ativ.titulo));
        card.appendChild(criar('div', 'materia-info', `${mat.nome} - ${mat.professor}`));
        card.appendChild(criar('div', 'prazo', `Prazo: ${formatarData(ativ.prazo)}`));
        if (ativ.descricao) card.appendChild(criar('p', '', ativ.descricao));

        if (ativ.imagem && ativ.imagem.startsWith('data:image/')) {
            const img = criar('img');
            img.src = ativ.imagem;
            img.alt = 'Anexo';
            card.appendChild(img);
        }

        const btnExcluir = criar('button', 'btn-excluir', 'Excluir');
        btnExcluir.addEventListener('click', () => deletarAtividade(ativ.id));
        card.appendChild(btnExcluir);

        listaAtividades.appendChild(card);
    });
}

// --- DELETAR ATIVIDADE ---
async function deletarAtividade(id) {
    if (!confirm("Tem certeza que deseja excluir esta atividade?")) return;
    try {
        await deleteDoc(doc(db, "atividades", id));
        // O onSnapshot redesenha a tela sozinho.
    } catch (erro) {
        console.error("Erro ao excluir: ", erro);
        alert("Erro ao excluir.");
    }
}

// --- IMAGEM: reduz e comprime antes de salvar ---
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

// --- SALVAR NOVA ATIVIDADE ---
form.onsubmit = async function (e) {
    e.preventDefault();
    const btnSalvar = document.querySelector('.btn-salvar');
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";

    try {
        const arquivoImg = document.getElementById('imagem').files[0];
        const imagem = arquivoImg ? await comprimirImagem(arquivoImg) : null;

        await addDoc(collection(db, "atividades"), {
            titulo: document.getElementById('titulo').value.trim(),
            materiaId: parseInt(document.getElementById('materia').value),
            prazo: document.getElementById('prazo').value,
            descricao: document.getElementById('descricao').value.trim(),
            imagem: imagem
        });

        fecharModal();
    } catch (erro) {
        console.error("Erro ao salvar: ", erro);
        alert(erro.message || "Erro ao salvar a atividade.");
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar Atividade";
    }
};

// Inicia o observador ao carregar o site
escutarAtividades();
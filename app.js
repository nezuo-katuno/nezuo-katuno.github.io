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

const modal = document.getElementById('modal');
const btnNova = document.getElementById('btn-nova-atividade');
const btnFechar = document.querySelector('.fechar');
const form = document.getElementById('form-atividade');
const selectMateria = document.getElementById('materia');
const listaAtividades = document.getElementById('lista-atividades');
const btnTema = document.getElementById('btn-tema');

// --- SISTEMA DE TEMA (CLARO/ESCURO) ---
if (localStorage.getItem('tema') === 'escuro') {
    document.body.classList.add('dark-mode');
    btnTema.textContent = '☀️ Claro';
}

btnTema.onclick = () => {
    document.body.classList.toggle('dark-mode');
    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('tema', 'escuro');
        btnTema.textContent = '☀️ Claro';
    } else {
        localStorage.setItem('tema', 'claro');
        btnTema.textContent = '🌙 Escuro';
    }
};

materias.forEach(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.nome} (${m.professor})`;
    selectMateria.appendChild(option);
});

btnNova.onclick = () => modal.classList.remove('oculto');
btnFechar.onclick = () => modal.classList.add('oculto');

// --- CACHE LOCAL PARA CARREGAMENTO INSTANTÂNEO ---
// Puxa da memória do navegador para mostrar na tela imediatamente (0 segundos)
let atividades = JSON.parse(localStorage.getItem('cacheAtividades')) || [];
if (atividades.length > 0) renderizarAtividades();

// --- ESCUTAR FIREBASE EM TEMPO REAL ---
// Conecta no Google e atualiza a tela automaticamente se houver novidades
function escutarAtividades() {
    onSnapshot(collection(db, "atividades"), (snapshot) => {
        atividades = [];
        snapshot.forEach((doc) => {
            atividades.push({ id: doc.id, ...doc.data() });
        });
        
        // Atualiza o cache invisível no fundo
        localStorage.setItem('cacheAtividades', JSON.stringify(atividades));
        
        // Redesenha a tela
        renderizarAtividades();
    }, (erro) => {
        console.error("Erro no Firebase: ", erro);
    });
}

function renderizarAtividades() {
    listaAtividades.innerHTML = '';
    atividades.sort((a, b) => new Date(a.prazo) - new Date(b.prazo));

    atividades.forEach(ativ => {
        const mat = materias.find(m => m.id == ativ.materiaId) || { nome: "Desconhecida", professor: "-" };
        
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <h3>${ativ.titulo}</h3>
            <div class="materia-info">${mat.nome} - ${mat.professor}</div>
            <div class="prazo">Prazo: ${ativ.prazo.split('-').reverse().join('/')}</div>
            <p>${ativ.descricao}</p>
            ${ativ.imagem ? `<img src="${ativ.imagem}" alt="Anexo">` : ''}
            <button class="btn-excluir" onclick="deletarAtividade('${ativ.id}')">Excluir</button>
        `;
        listaAtividades.appendChild(card);
    });
}

// --- DELETAR ATIVIDADE ---
// Como usamos type="module", precisamos atrelar a função ao objeto global (window)
window.deletarAtividade = async function(id) {
    if(confirm("Tem certeza que deseja excluir esta atividade?")) {
        try {
            await deleteDoc(doc(db, "atividades", id));
            // Não precisa chamar renderizarAtividades() pois o onSnapshot faz isso sozinho!
        } catch (erro) {
            console.error("Erro ao excluir: ", erro);
            alert("Erro ao excluir.");
        }
    }
};

// Salvar Nova Atividade
form.onsubmit = async function(e) {
    e.preventDefault();
    const arquivoImg = document.getElementById('imagem').files[0];
    const btnSalvar = document.querySelector('.btn-salvar');
    
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
    
    const salvarFirebase = async (imgBase64 = null) => {
        const novaAtividade = {
            titulo: document.getElementById('titulo').value,
            materiaId: parseInt(document.getElementById('materia').value),
            prazo: document.getElementById('prazo').value,
            descricao: document.getElementById('descricao').value,
            imagem: imgBase64
        };
        
        try {
            await addDoc(collection(db, "atividades"), novaAtividade);
            form.reset();
            modal.classList.add('oculto');
        } catch (erro) {
            alert("Erro ao salvar a atividade.");
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.textContent = "Salvar Atividade";
        }
    };

    if (arquivoImg) {
        if (arquivoImg.size > 800000) {
            alert("Imagem muito grande. Escolha uma imagem até 800KB.");
            btnSalvar.disabled = false;
            btnSalvar.textContent = "Salvar Atividade";
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => salvarFirebase(reader.result);
        reader.readAsDataURL(arquivoImg);
    } else {
        salvarFirebase();
    }
};

// Inicia o observador ao carregar o site
escutarAtividades();
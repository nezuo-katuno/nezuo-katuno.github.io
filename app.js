// Importa o banco de dados do seu arquivo de configuração
import { db, collection, addDoc, getDocs } from './firebase-config.js';

// As 16 matérias mantidas
const materias = [
    { id: 1, nome: "Matemática", professor: "Profa. Pétria" },
    { id: 2, nome: "Física", professor: "Prof. Fábio" },
    { id: 3, nome: "Química", professor: "Profa. Amanda" },
    { id: 4, nome: "Animação 3D", professor: "Prof. Robson" },
    { id: 5, nome: "TDDGAIII", professor: "Prof. Robson" },
    { id: 6, nome: "Ética e Cidadania Organizacional", professor: "Profa. Juliana" },
    { id: 7, nome: "Português", professor: "Profa. Mariângela" },
    { id: 8, nome: "TLBD", professor: "Prof. Jackson" },
    { id: 9, nome: "Inglês", professor: "Prof. Gilson" },
    { id: 10, nome: "Espanhol", professor: "Profa. Janaina" },
    { id: 11, nome: "LPII", professor: "Prof. Marcos" },
    { id: 12, nome: "PDTCC", professor: "Prof. Luiz Angelo" },
    { id: 13, nome: "Filosofia", professor: "Prof. Carlos" },
    { id: 14, nome: "Sociologia", professor: "Prof. Carlos" },
    { id: 15, nome: "Programação para Dispositivos Móveis", professor: "Prof. Marcos" },
    { id: 16, nome: "Marketing para jogos Digitais", professor: "Prof. João Paulo" }
];

// Elementos da DOM
const modal = document.getElementById('modal');
const btnNova = document.getElementById('btn-nova-atividade');
const btnFechar = document.querySelector('.fechar');
const form = document.getElementById('form-atividade');
const selectMateria = document.getElementById('materia');
const listaAtividades = document.getElementById('lista-atividades');

// Preencher o select de matérias
materias.forEach(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.nome} (${m.professor})`;
    selectMateria.appendChild(option);
});

// Controle do Modal
btnNova.onclick = () => modal.classList.remove('oculto');
btnFechar.onclick = () => modal.classList.add('oculto');

// Variável para armazenar atividades na memória temporária
let atividades = [];

// Função assíncrona para buscar dados do Firebase
async function carregarAtividades() {
    try {
        const querySnapshot = await getDocs(collection(db, "atividades"));
        atividades = []; // Limpa a lista antes de preencher
        
        querySnapshot.forEach((doc) => {
            // Guarda o ID gerado pelo Firebase junto com os dados
            atividades.push({ id: doc.id, ...doc.data() });
        });
        
        renderizarAtividades();
    } catch (erro) {
        console.error("Erro ao buscar atividades: ", erro);
    }
}

function renderizarAtividades() {
    listaAtividades.innerHTML = '';
    
    // Ordenar por prazo mais próximo
    atividades.sort((a, b) => new Date(a.prazo) - new Date(b.prazo));

    atividades.forEach(ativ => {
        // Encontra a matéria correspondente, com fallback caso mude algo
        const mat = materias.find(m => m.id == ativ.materiaId) || { nome: "Desconhecida", professor: "-" };
        
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <h3>${ativ.titulo}</h3>
            <div class="materia-info">${mat.nome} - ${mat.professor}</div>
            <div class="prazo">Prazo: ${ativ.prazo.split('-').reverse().join('/')}</div>
            <p>${ativ.descricao}</p>
            ${ativ.imagem ? `<img src="${ativ.imagem}" alt="Anexo">` : ''}
        `;
        listaAtividades.appendChild(card);
    });
}

// Salvar Nova Atividade no Firebase
form.onsubmit = function(e) {
    e.preventDefault();
    
    const arquivoImg = document.getElementById('imagem').files[0];
    const btnSalvar = document.querySelector('.btn-salvar');
    
    // Desabilita o botão para evitar cliques duplos
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
            // addDoc cria um novo documento com ID automático na coleção "atividades"
            await addDoc(collection(db, "atividades"), novaAtividade);
            form.reset();
            modal.classList.add('oculto');
            carregarAtividades(); // Recarrega a lista atualizada
        } catch (erro) {
            console.error("Erro ao salvar: ", erro);
            alert("Erro ao salvar a atividade. Verifique o console.");
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.textContent = "Salvar Atividade";
        }
    };

    // Continua usando Base64 para as imagens como protótipo
    if (arquivoImg) {
        // Alerta de limite do Firestore (1MB por documento)
        if (arquivoImg.size > 800000) {
            alert("A imagem é muito grande. Escolha uma imagem menor que 800KB.");
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

// Inicialização: carrega as atividades ao abrir o site
carregarAtividades();

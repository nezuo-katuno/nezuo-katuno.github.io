// As 16 matérias (você pode editar os nomes dos professores)
const materias = [
    { id: 1, nome: "Matemática", professor: "Prof. Alberto" },
    { id: 2, nome: "Física", professor: "Prof. Bruno" },
    { id: 3, nome: "Química", professor: "Profa. Carla" },
    { id: 4, nome: "Biologia", professor: "Profa. Daniela" },
    { id: 5, nome: "História", professor: "Prof. Eduardo" },
    { id: 6, nome: "Geografia", professor: "Profa. Fernanda" },
    { id: 7, nome: "Português", professor: "Prof. Gustavo" },
    { id: 8, nome: "Literatura", professor: "Profa. Helena" },
    { id: 9, nome: "Inglês", professor: "Prof. Igor" },
    { id: 10, nome: "Espanhol", professor: "Profa. Júlia" },
    { id: 11, nome: "Artes", professor: "Prof. Kleber" },
    { id: 12, nome: "Educação Física", professor: "Profa. Laura" },
    { id: 13, nome: "Filosofia", professor: "Prof. Marcos" },
    { id: 14, nome: "Sociologia", professor: "Profa. Natália" },
    { id: 15, nome: "Redação", professor: "Prof. Otávio" },
    { id: 16, nome: "Geometria", professor: "Profa. Paula" }
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

// Carregar atividades do LocalStorage (Protótipo offline)
let atividades = JSON.parse(localStorage.getItem('atividades')) || [];

function renderizarAtividades() {
    listaAtividades.innerHTML = '';
    // Ordenar por prazo mais próximo
    atividades.sort((a, b) => new Date(a.prazo) - new Date(b.prazo));

    atividades.forEach(ativ => {
        const mat = materias.find(m => m.id == ativ.materiaId);
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

// Salvar Nova Atividade
form.onsubmit = function(e) {
    e.preventDefault();
    
    const arquivoImg = document.getElementById('imagem').files[0];
    
    // Função para salvar a atividade após tratar a imagem
    const salvar = (imgBase64 = null) => {
        const novaAtividade = {
            id: Date.now(),
            titulo: document.getElementById('titulo').value,
            materiaId: document.getElementById('materia').value,
            prazo: document.getElementById('prazo').value,
            descricao: document.getElementById('descricao').value,
            imagem: imgBase64
        };
        
        atividades.push(novaAtividade);
        localStorage.setItem('atividades', JSON.stringify(atividades));
        
        form.reset();
        modal.classList.add('oculto');
        renderizarAtividades();
    };

    // Converter imagem para Base64 (solução temporária para frontend puro sem backend de arquivos)
    if (arquivoImg) {
        const reader = new FileReader();
        reader.onloadend = () => salvar(reader.result);
        reader.readAsDataURL(arquivoImg);
    } else {
        salvar();
    }
};

// Inicialização
renderizarAtividades();
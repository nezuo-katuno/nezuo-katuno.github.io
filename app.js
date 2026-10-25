import {
    db, auth,
    collection, addDoc, doc, deleteDoc, updateDoc, onSnapshot,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from './firebase-config.js';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

// Depois de criar a SUA conta no site, copie o UID dela no console do Firebase
// (Authentication > Users) e cole aqui. Cole o mesmo UID nas regras do Firestore.
// É as regras do Firestore que realmente protegem os dados; esta constante só
// decide quais botões aparecem na tela.
const ADMIN_UID = "COLE_AQUI_O_UID_DO_ADMIN";

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

// ============================================================
// TEMA (CLARO/ESCURO)
// ============================================================
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
}

function fecharModal() {
    modal.classList.add('oculto');
    form.reset();
    editandoId = null;
    modalTitulo.textContent = 'Adicionar Atividade';
}

btnNova.onclick = () => abrirModal(null);
btnFechar.onclick = fecharModal;
modal.addEventListener('click', (e) => {
    if (e.target === modal) fecharModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('oculto')) fecharModal();
});

// ============================================================
// ATIVIDADES: cache + tempo real
// ============================================================
let atividades = [];
let ehAdmin = false;
let cancelarEscuta = null;

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
            criar('p', '', 'Não foi possível carregar as atividades. Entre de novo ou verifique a conexão.')
        );
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

    if (atividades.length === 0) {
        listaAtividades.appendChild(
            criar('p', '', ehAdmin
                ? 'Nenhuma atividade ainda. Toque em "+ Nova Atividade" para começar.'
                : 'Nenhuma atividade por enquanto.')
        );
        return;
    }

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

        // Só o admin vê os botões de gerenciar. Os amigos só visualizam.
        if (ehAdmin) {
            const acoes = criar('div', 'card-acoes');

            const btnEditar = criar('button', 'btn-editar', 'Editar');
            btnEditar.addEventListener('click', () => abrirModal(ativ));
            acoes.appendChild(btnEditar);

            const btnExcluir = criar('button', 'btn-excluir', 'Excluir');
            btnExcluir.addEventListener('click', () => deletarAtividade(ativ.id));
            acoes.appendChild(btnExcluir);

            card.appendChild(acoes);
        }

        listaAtividades.appendChild(card);
    });
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
form.onsubmit = async function (e) {
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
};

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
        ehAdmin = false;
        atividades = [];
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

    telaLogin.hidden = true;
    areaApp.hidden = false;
    btnSair.hidden = false;
    btnNova.hidden = !ehAdmin;
    spanUsuario.hidden = false;
    spanUsuario.textContent = `${user.email.split('@')[0]}${ehAdmin ? ' (admin)' : ''}`;

    // Mostra o cache na hora e depois o Firebase atualiza em tempo real.
    atividades = lerCache();
    if (atividades.length > 0) renderizarAtividades();
    cancelarEscuta = escutarAtividades();
});
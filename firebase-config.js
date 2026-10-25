import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjYN-Gvk4cCW-_WD1o8UfUVHukbud4tUM",
  authDomain: "agenda-escolar-a4624.firebaseapp.com",
  projectId: "agenda-escolar-a4624",
  storageBucket: "agenda-escolar-a4624.firebasestorage.app",
  messagingSenderId: "236604812722",
  appId: "1:236604812722:web:04cfb93f47efe3fe4d88ab",
  measurementId: "G-DSLHJJTCJ8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, addDoc, getDocs };
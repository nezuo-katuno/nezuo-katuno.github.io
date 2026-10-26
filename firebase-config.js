import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, deleteDoc, updateDoc, setDoc, getDoc,
  onSnapshot, query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDS5LQJvSQEONYtK5Op5zLrJ8bgiQvsy2o",
  authDomain: "agenda-escolar-27c56.firebaseapp.com",
  projectId: "agenda-escolar-27c56",
  storageBucket: "agenda-escolar-27c56.firebasestorage.app",
  messagingSenderId: "54115560266",
  appId: "1:54115560266:web:f35cbfa33ff3e9e4c46fb3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
  db, auth,
  collection, addDoc, doc, deleteDoc, updateDoc, setDoc, getDoc,
  onSnapshot, query, orderBy, limit, serverTimestamp,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
};
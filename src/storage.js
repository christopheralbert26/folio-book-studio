import { openDB } from 'idb';
const db = openDB('folio-private-studio', 1, { upgrade(db) { db.createObjectStore('projects', { keyPath: 'id' }); } });
export async function saveProject(project) { await (await db).put('projects', { ...project, updated: Date.now() }); }
export async function getProjects() { return (await (await db).getAll('projects')).sort((a,b)=>b.updated-a.updated); }
export async function deleteProject(id) { await (await db).delete('projects', id); }

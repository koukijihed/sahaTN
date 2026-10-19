// Abstraction du stockage des documents medicaux. Le contenu binaire ne vit
// jamais dans la base de donnees : seules les metadonnees y figurent. Une
// implementation locale privee est fournie pour le developpement et les tests ;
// l'interface permet d'ajouter plus tard un stockage objet prive (S3-compatible)
// sans toucher au domaine.

export const MEDICAL_DOCUMENT_STORAGE = 'MEDICAL_DOCUMENT_STORAGE';

export interface MedicalDocumentStorage {
  // Enregistre le contenu sous une cle generee par le serveur. La cle est
  // toujours relative a la racine privee ; toute tentative de sortie de la
  // racine (traversee de repertoire, chemin absolu) doit etre rejetee.
  save(key: string, content: Buffer): Promise<void>;

  // Lit le contenu associe a la cle. Rejette une cle hors racine.
  read(key: string): Promise<Buffer>;

  // Retire physiquement un contenu (nettoyage). L'effacement des documents
  // medicaux reste LOGIQUE au niveau metier ; cette methode n'est utilisee que
  // pour annuler un depot qui n'a pas abouti en base.
  remove(key: string): Promise<void>;
}

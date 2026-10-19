import { FHIR_PROFILE, SAHATN_ID_SYSTEM } from '../fhir.constants';
import type { DocumentSource } from '../fhir.sources';
import type {
  FhirDocumentReference,
  FhirDocumentReferenceStatus
} from '../fhir.types';
import { lookup, meta, reference, toInstant } from './converter-support';

const DOCUMENT_CATEGORY_LABEL: Record<DocumentSource['category'], string> = {
  LAB_RESULT: 'Resultat de laboratoire',
  IMAGING: 'Imagerie',
  REPORT: 'Compte rendu',
  PRESCRIPTION: 'Ordonnance',
  OTHER: 'Autre'
};

// Le titre de la piece jointe est un nom de fichier fourni par l'utilisateur.
// On n'expose QUE le nom de base, sans aucun separateur de chemin, afin de ne
// jamais laisser fuiter un chemin interne ou une cle de stockage.
export function sanitizeAttachmentTitle(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f]/g, '').trim();
  return cleaned.length > 0 ? cleaned : 'document';
}

// Mapping SahaTN MedicalDocument -> FHIR DocumentReference (R4).
//
// SECURITE (exigences Jour 10/11) :
// - `storageKey`, chemin physique et URL publique ne sont JAMAIS exportes.
// - le contenu binaire (base64) n'est PAS embarre dans le Bundle.
// - aucun lien de telechargement contournant les autorisations n'est cree.
// Seules des METADONNEES (type, taille, titre, date, auteur, empreinte de
// contexte) sont exposees.
//
// Limites :
// - `type` / `category` : libelles metier non codes (texte uniquement).
// - l'empreinte SHA-256 source n'est pas exportee : FHIR `Attachment.hash`
//   attend un SHA-1 en base64 ; on n'introduit pas d'extension non standard.
export function toFhirDocumentReference(
  source: DocumentSource,
  patientId: string
): FhirDocumentReference {
  const status: FhirDocumentReferenceStatus =
    source.status === 'ARCHIVED' ? 'superseded' : 'current';

  const documentReference: FhirDocumentReference = {
    resourceType: 'DocumentReference',
    id: source.id,
    meta: meta(FHIR_PROFILE.documentReference),
    masterIdentifier: {
      system: SAHATN_ID_SYSTEM.document,
      value: source.id
    },
    status,
    docStatus: 'final',
    type: {
      text: lookup(DOCUMENT_CATEGORY_LABEL, source.category, 'document category')
    },
    subject: reference('Patient', patientId),
    date: toInstant(source.createdAt),
    context: { period: { start: toInstant(source.createdAt) } },
    content: [
      {
        attachment: {
          contentType: source.mimeType,
          title: sanitizeAttachmentTitle(source.originalName),
          size: source.sizeBytes,
          creation: toInstant(source.createdAt)
        }
      }
    ]
  };

  if (source.uploaderDoctorProfileId) {
    documentReference.author = [
      reference('Practitioner', source.uploaderDoctorProfileId)
    ];
  }
  if (source.encounterId) {
    documentReference.context!.encounter = [reference('Encounter', source.encounterId)];
  }

  return documentReference;
}

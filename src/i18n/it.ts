import type { Messages } from "./en";

/** Italian UI strings (the default language). */
export const it: Messages = {
  locale: "it",

  seed: {
    workspace: "Personale",
    column: "Per iniziare",
    block: "Benvenuto",
    link: "Stargate repo",
    kanban: ["Da fare", "In corso", "Fatto"],
    newWorkspace: "Nuovo workspace",
    untitledBlock: "Blocco senza titolo",
    bookmarksUngroupedBlock: "Generali",
    bookmarksWorkspace: "Segnalibri",
    bookmarksColumn: "Link",
  },

  theme: { light: "Chiaro", dark: "Scuro", system: "Sistema" },
  faviconSource: { off: "Disattivate", "google-s2": "Google", duckduckgo: "DuckDuckGo" },
  faviconSize: { sm: "Piccola 16", md: "Media 24", lg: "Grande 32" },
  linkStyle: { list: "Elenco", detail: "Dettaglio", tiles: "Riquadri" },
  titleSize: { sm: "Piccoli", md: "Medi", lg: "Grandi" },
  openWorkspace: { first: "Primo workspace", last: "Ultimo usato" },

  syncStatus: {
    off: "Accesso non effettuato.",
    syncing: "Sincronizzazione…",
    synced: "Tutto aggiornato.",
    offline: "Offline — le modifiche verranno sincronizzate quando torni online.",
    error: "Problema di sincronizzazione — nuovo tentativo in corso.",
  },
  syncConflict: "Un altro dispositivo continua a modificare i tuoi dati; nuovo tentativo in corso.",

  errors: {
    "invalid-json": "Questo non è un file JSON valido.",
    "invalid-state": "Questo file non contiene dati Stargate validi.",
    "missing-schema": "Questo file non è un'esportazione di Stargate (manca schemaVersion).",
    "newer-version": "Questo file è stato creato da una versione più recente di Stargate.",
    "cannot-migrate": "La versione del formato di questo file non è supportata.",
    "invalid-bookmarks": "Questo non è un file di segnalibri del browser valido.",
    "storage-full": "Spazio di archiviazione pieno — rimuovi uno sfondo o esporta un backup.",
    "image-unreadable": "Impossibile caricare questa immagine.",
    "favicon-too-large": "Questa immagine non può essere usata come icona (max 8 KB dopo il ridimensionamento).",
    "background-too-large": "Questa immagine è troppo grande per essere usata come sfondo (oltre 700 KB dopo la compressione).",
    saveFailed: "Impossibile salvare le modifiche.",
    recompressFailed: "Impossibile ricomprimere l'immagine di sfondo.",
    importFailed: "Impossibile importare questo file.",
    fileUnreadable: "Impossibile leggere questo file.",
    bookmarksUnreadable: "Impossibile leggere questo file di segnalibri.",
    backgroundUnusable: (limitKb: number) =>
      `Questa immagine non può essere usata come sfondo (max ${limitKb} KB dopo la compressione).`,
  },

  toast: {
    syncLoaded: "Caricati i dati sincronizzati con il tuo account.",
    signInFailed: (detail?: string) => (detail ? `Accesso non riuscito: ${detail}` : "Accesso non riuscito."),
    signOutFailed: (detail?: string) => (detail ? `Disconnessione non riuscita: ${detail}` : "Disconnessione non riuscita."),
    backgroundSet: (size: string) => `Sfondo impostato (${size})`,
    backgroundRemoved: "Sfondo rimosso",
    dataRestored: "Dati ripristinati dal file",
    noBookmarks: "Nessun segnalibro trovato in questo file.",
    nothingToImport: "Niente da importare nelle cartelle selezionate.",
    bookmarksAdded: (n: number) =>
      n === 1 ? "Aggiunto 1 workspace dai tuoi segnalibri" : `Aggiunti ${n} workspace dai tuoi segnalibri`,
    deletedWorkspace: (name: string) => `Workspace “${name}” eliminato`,
    deletedColumn: (name: string) => `Colonna “${name}” eliminata`,
    deletedBlock: (name: string) => `Blocco “${name}” eliminato`,
    deletedLink: (name: string) => `“${name}” eliminato`,
    deletedTask: (name: string) => `Attività “${name}” eliminata`,
    undo: "Annulla",
  },

  confirmImport: {
    title: "Sostituire tutti i tuoi dati?",
    text: (n: number) =>
      `Questo file contiene ${n} workspace. Sostituiranno tutto quello che hai ora. Se potresti volerlo recuperare, esporta prima un backup.`,
    ok: "Sostituisci",
  },

  search: {
    placeholder: "Cerca sul web o tra i tuoi link",
    label: "Cerca",
    engineLabel: "Motore di ricerca",
    webFor: (engine: string, query: string) => `Cerca “${query}” su ${engine}`,
    noMatches: "Nessun risultato",
    groups: { web: "Web", links: "Link", actions: "Azioni" },
  },

  actions: {
    goTo: (name: string) => `Vai a ${name}`,
    showLinks: "Mostra link",
    showKanban: "Mostra kanban",
    newWorkspace: "Nuovo workspace",
    editWorkspace: "Modifica questo workspace",
    switchTheme: "Cambia tema",
    openSettings: "Apri impostazioni",
    exportBackup: "Esporta backup",
    importBookmarks: "Importa segnalibri del browser",
  },

  hero: {
    links: (n: number) => `${n} link`,
    openTasks: (n: number) => (n === 1 ? "1 attività aperta" : `${n} attività aperte`),
    dueOrOverdue: (n: number) => (n === 1 ? "1 in scadenza o scaduta" : `${n} in scadenza o scadute`),
    hintSearch: "cerca",
    hintActions: "azioni rapide",
  },

  notices: {
    recompressing: "Ricompressione…",
    recompress: "Ricomprimi sfondi",
    export: "Esporta",
    dismiss: "Chiudi",
    recovered: "I tuoi dati sono stati recuperati da un backup. Aggiungi di nuovo le immagini di sfondo.",
  },

  board: {
    columnLabel: (title: string) => `Colonna ${title}`,
    columnTitle: "Titolo colonna",
    renameHint: "Clicca per rinominare · trascina per riordinare",
    deleteColumn: "Elimina colonna",
    expandBlock: "Espandi blocco",
    collapseBlock: "Comprimi blocco",
    blockSettings: "Impostazioni blocco",
    deleteBlock: "Elimina blocco",
    editLink: "Modifica link",
    deleteLink: "Elimina link",
    newLinkPlaceholder: "Titolo https://… o solo un dominio",
    newLink: "Nuovo link",
    addLink: "Aggiungi link",
    blockTitle: "Titolo blocco",
    newBlock: "Nuovo blocco",
    addBlock: "Aggiungi blocco",
    newColumn: "Nuova colonna",
    addColumn: "Aggiungi colonna",
  },

  kanban: {
    taskTitle: "Titolo attività",
    clickToEdit: "Clicca per modificare",
    notesAndDue: "Note e scadenza",
    addNote: "+ nota",
    notesPlaceholder: "Note…",
    notes: "Note",
    due: "Scadenza",
    clear: "Rimuovi",
    deleteTask: "Elimina attività",
    done: "Fatto",
    newTask: "Nuova attività",
    addTask: "Aggiungi attività",
    today: "Oggi",
    overdue: (date: string) => `Scaduta · ${date}`,
  },

  dock: {
    label: "Workspace e strumenti",
    newWorkspace: "Nuovo workspace",
    links: "Link",
    kanban: "Kanban",
    workspaceSettings: "Impostazioni workspace",
    quickActions: (shortcut: string) => `Azioni rapide (${shortcut})`,
    theme: (label: string) => `Tema: ${label}`,
    settings: "Impostazioni",
  },

  common: {
    close: "Chiudi",
    cancel: "Annulla",
    save: "Salva",
    done: "Fatto",
    remove: "Rimuovi",
    delete: "Elimina",
    import: "Importa",
  },

  settings: {
    title: "Impostazioni",
    appearance: "Aspetto",
    theme: "Tema",
    language: "Lingua",
    blockTitles: "Titoli dei blocchi",
    layout: (workspace: string) => `Layout · ${workspace}`,
    columns: "Colonne",
    fewerColumns: "Meno colonne",
    moreColumns: "Più colonne",
    auto: "Auto",
    fullWidth: "Larghezza piena",
    columnGap: "Spazio tra le colonne",
    search: "Ricerca",
    defaultEngine: "Motore predefinito",
    favicons: "Favicon",
    fetchIconsFrom: "Scarica le icone dei siti da",
    faviconsNote:
      "Disattivate di default: il fornitore vedrebbe l'elenco dei siti nei tuoi segnalibri. Le icone con l'iniziale funzionano sempre offline.",
    onStartup: "All'avvio",
    open: "Apri",
    sync: "Sincronizzazione",
    signedIn: (email: string) => (email ? `Accesso effettuato come ${email}` : "Accesso effettuato"),
    signOut: "Esci",
    syncedNote: "Link, attività e impostazioni sono sincronizzati tra i tuoi browser; le immagini di sfondo restano su questo dispositivo.",
    signInWith: "Accedi con",
    syncOptionalNote:
      "Facoltativo. Mantiene link, attività e impostazioni sincronizzati tra i tuoi browser. Le immagini di sfondo restano su questo dispositivo.",
    yourData: "I tuoi dati",
    usageOf: (used: string) => `${used} su ~5 MB`,
    backgrounds: "Sfondi",
    linksAndTasks: "Link e attività",
    ofBrowserStorage: "su ~5 MB di spazio del browser",
    exportBackup: "Esporta backup",
    restoreFromFile: "Ripristina da file",
    importBookmarks: "Importa segnalibri del browser",
    dataNoteSynced:
      "Le immagini di sfondo restano solo in questo browser; tutto il resto è sincronizzato anche con il tuo account. Esporta un backup ogni tanto.",
    dataNoteLocal:
      "Tutto è salvato in questo browser. Nelle finestre private/in incognito è temporaneo e non è condiviso tra browser, quindi esporta un backup ogni tanto.",
  },

  workspace: {
    title: "Workspace",
    name: "Nome",
    icon: "Icona",
    colour: "Colore",
    customColour: "Colore personalizzato",
    background: "Sfondo",
    noBackground: "Nessuna immagine di sfondo",
    replaceImage: "Sostituisci immagine",
    uploadImage: "Carica immagine",
    strength: "Intensità",
    backgroundStrength: "Intensità dello sfondo",
    compressionNote: "Le immagini vengono compresse nel browser a circa 500 KB.",
    delete: "Elimina workspace",
  },

  blockSettings: {
    title: "Impostazioni blocco",
    blockTitle: "Titolo",
    titlePlaceholder: "Titolo del blocco…",
    description: "Descrizione",
    optional: "Facoltativa",
    linkStyle: "Stile dei link",
    faviconSize: "Dimensione favicon",
    tilesNote: "I riquadri usano sempre un'icona grande.",
    preview: "Anteprima",
  },

  linkSettings: {
    title: "Modifica link",
    customIcon: "Icona personalizzata",
    letterTile: "Icona con iniziale",
    customIconNote: "Salvata con i tuoi dati, funziona offline.",
    letterTileNote: "Carica una piccola immagine per usare un'icona tua.",
    change: "Cambia",
    uploadIcon: "Carica icona",
    linkTitle: "Titolo",
    titlePlaceholder: "Titolo…",
    url: "URL",
  },

  bookmarks: {
    title: "Importa segnalibri del browser",
    intro:
      "Ogni cartella di primo livello diventa un nuovo workspace e le sue sottocartelle diventano blocchi. Deseleziona ciò che vuoi escludere. I tuoi workspace attuali non vengono modificati.",
    folderSummary: (links: number, folders: number) =>
      `${links} link · ${folders} ${folders === 1 ? "cartella" : "cartelle"}`,
    ungroupedBlock: (block: string) => `Metti i link sciolti di una cartella in un blocco “${block}”`,
    rootLinks: (n: number, workspace: string) =>
      n === 1
        ? `Importa il link fuori da ogni cartella come workspace “${workspace}”`
        : `Importa i ${n} link fuori da ogni cartella come workspace “${workspace}”`,
    willBeAdded: (n: number) => (n === 1 ? "Verrà aggiunto 1 workspace" : `Verranno aggiunti ${n} workspace`),
  },

  palette: {
    label: "Azioni rapide",
    placeholder: "Cerca link, workspace, azioni o sul web",
    move: "sposta",
    open: "apri",
    focusSearch: "vai alla ricerca",
    workspaces: "workspace",
  },
};

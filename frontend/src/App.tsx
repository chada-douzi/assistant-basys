import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import './App.css'

type Source = {
  slug: string
  title: string
  category: string
  source: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  error?: boolean
  truncated?: true
  truncatedMessage?: string
}

type Conversation = {
  id: string
  title: string
  messages: ChatMessage[]
}

type Health = {
  status: string
  service: string
  timestamp: string
}

type KnowledgeDocument = {
  _id?: string
  slug: string
  title: string
  category: string
  content: string
  source: string
  tags: string[]
}

type ChatResponse = {
  question: string
  answer: string
  sources: Source[]
  truncated?: true
  truncatedMessage?: string
}

const suggestions = [
  {
    icon: '◷',
    title: 'Maintenance préventive',
    text: 'Quel est l’objectif de la maintenance préventive ?',
  },
  {
    icon: '⌕',
    title: 'Historique des interventions',
    text: 'Comment consulter un historique de maintenance ?',
  },
  {
    icon: '▤',
    title: 'Informations disponibles',
    text: 'Quelles informations sont disponibles sur les équipements ?',
  },
  {
    icon: '✓',
    title: 'Suivi des interventions',
    text: 'Quels sont les statuts possibles d’une intervention ?',
  },
]

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: string }
    return data.error || `Erreur HTTP ${response.status}`
  } catch {
    return `Erreur HTTP ${response.status}`
  }
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState(false)
  const [search, setSearch] = useState('')
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [searchError, setSearchError] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [panel, setPanel] = useState<'chat' | 'documents'>('chat')
  const [mobileNav, setMobileNav] = useState(false)
  const [expandedSource, setExpandedSource] = useState<string | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocument | null>(null)
  const [documentBusy, setDocumentBusy] = useState(false)
  const [documentError, setDocumentError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeId) ?? null

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health')
      if (!response.ok) throw new Error('API indisponible')
      const data = await response.json() as Health
      setHealth(data)
      setHealthError(false)
    } catch {
      setHealth(null)
      setHealthError(true)
    }
  }, [])

  useEffect(() => {
    const initialCheck = window.setTimeout(() => {
      void checkHealth()
    }, 0)

    const interval = window.setInterval(() => void checkHealth(), 30000)

    return () => {
      window.clearTimeout(initialCheck)
      window.clearInterval(interval)
    }
  }, [checkHealth])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [activeConversation?.messages, busy])

  // Fermeture de la modal lecteur de document avec la touche Escape
  useEffect(() => {
    const isOpen = documentBusy || documentError !== '' || selectedDocument !== null
    if (!isOpen) return

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !documentBusy) {
        setSelectedDocument(null)
        setDocumentError('')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [documentBusy, documentError, selectedDocument])

  const createConversation = () => {
    if (busy) return
    const conversation: Conversation = {
      id: newId(),
      title: 'Nouvelle conversation',
      messages: [],
    }
    setConversations((current) => [conversation, ...current])
    setActiveId(conversation.id)
    setPanel('chat')
    setInput('')
    setMobileNav(false)
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }


  const sendMessage = async (value: string) => {
    const question = value.trim()
    if (question.length < 2 || busy) return

    let conversation = activeConversation

    if (!conversation) {
      conversation = {
        id: newId(),
        title: question.length > 42 ? `${question.slice(0, 42)}…` : question,
        messages: [],
      }
      setConversations((current) => [conversation!, ...current])
      setActiveId(conversation.id)
    }

    const conversationId = conversation.id
    const userMessage: ChatMessage = {
      id: newId(),
      role: 'user',
      content: question,
    }

    const assistantMessage: ChatMessage = {
      id: newId(),
      role: 'assistant',
      content: '',
    }

    const updatedMessages = [
      ...conversation.messages,
      userMessage,
      assistantMessage,
    ]

    setConversations((current) => {
      const exists = current.some((item) => item.id === conversationId)
      if (exists) {
        return current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                title: item.messages.length === 0
                  ? (question.length > 42 ? `${question.slice(0, 42)}…` : question)
                  : item.title,
                messages: updatedMessages,
              }
            : item,
        )
      }
      return [{
        ...conversation!,
        title: question.length > 42 ? `${question.slice(0, 42)}…` : question,
        messages: updatedMessages,
      }, ...current]
    })

    setInput('')
    setBusy(true)
    setPanel('chat')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      if (!response.ok) {
        throw new Error(await readError(response))
      }

      const data = await response.json() as ChatResponse
      const reply: ChatMessage = {
        ...assistantMessage,
        content: data.answer,
        sources: Array.isArray(data.sources) ? data.sources : [],
        ...(data.truncated && {
          truncated: true,
          truncatedMessage: data.truncatedMessage,
        }),
      }

      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                messages: item.messages.map((message) =>
                  message.id === assistantMessage.id ? reply : message,
                ),
              }
            : item,
        ),
      )
      void checkHealth()
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Une erreur inattendue est survenue.'

      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                messages: item.messages.map((entry) =>
                  entry.id === assistantMessage.id
                    ? {
                        ...entry,
                        content: message,
                        error: true,
                      }
                    : entry,
                ),
              }
            : item,
        ),
      )
    } finally {
      setBusy(false)
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void sendMessage(input)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage(input)
    }
  }

  const openDocument = async (slug: string) => {
    setSelectedDocument(null)
    setDocumentError('')
    setDocumentBusy(true)

    try {
      const response = await fetch(
        `/api/knowledge/${encodeURIComponent(slug)}`,
      )

      if (!response.ok) {
        let message = 'Impossible de charger ce document.'
        try {
          const errorData = await response.json() as { error?: string }
          if (errorData.error) message = errorData.error
        } catch {
          // Conserver le message par défaut si la réponse n'est pas JSON.
        }
        throw new Error(message)
      }

      const data = await response.json() as { document: KnowledgeDocument }

      if (!data.document || typeof data.document.content !== 'string') {
        throw new Error('Le contenu du document est indisponible.')
      }

      setSelectedDocument(data.document)
    } catch (error) {
      setDocumentError(
        error instanceof Error
          ? error.message
          : 'Une erreur est survenue lors du chargement.',
      )
    } finally {
      setDocumentBusy(false)
    }
  }
  const searchDocumentsByQuery = async (rawQuery: string) => {
    const query = rawQuery.trim()

    if (query.length < 2) {
      setSearchError('Saisis au moins 2 caractères.')
      setDocuments([])
      return
    }

    setSearchBusy(true)
    setSearchError('')
    setDocuments([])

    try {
      const response = await fetch(
        `/api/knowledge?q=${encodeURIComponent(query)}`,
      )
      if (!response.ok) throw new Error(await readError(response))

      const data = await response.json() as {
        results: KnowledgeDocument[]
      }

      setDocuments(Array.isArray(data.results) ? data.results : [])
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : 'Recherche impossible.',
      )
    } finally {
      setSearchBusy(false)
    }
  }

  const searchDocuments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await searchDocumentsByQuery(search)
  }

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="mobile-overlay"
          aria-label="Fermer la navigation"
          onClick={() => setMobileNav(false)}
        />
      )}

      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <button className="brand" onClick={() => {
          setPanel('chat')
          setMobileNav(false)
        }}>
          <span className="brand-mark">B</span>
          <span className="brand-copy">
            <strong>BaSYS Assistant</strong>
            <small>Knowledge workspace</small>
          </span>
        </button>

        <button className="new-chat" onClick={createConversation}>
          <span>＋</span> Nouvelle conversation
          <kbd>⌘ K</kbd>
        </button>

        <div className="nav-label">ESPACE DE TRAVAIL</div>
        <button
          className={`nav-item ${panel === 'chat' ? 'nav-active' : ''}`}
          onClick={() => {
            setPanel('chat')
            setMobileNav(false)
          }}
        >
          <span className="nav-icon">▤</span> Assistant
        </button>
        <button
          className={`nav-item ${panel === 'documents' ? 'nav-active' : ''}`}
          onClick={() => {
            setPanel('documents')
            setMobileNav(false)
          }}
        >
          <span className="nav-icon">⌕</span> Base documentaire
        </button>

        <div className="nav-label history-label">RÉCENT</div>
        <div className="conversation-list">
          {conversations.length === 0 && (
            <p className="empty-history">Tes conversations apparaîtront ici.</p>
          )}
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`history-item ${activeId === conversation.id ? 'history-active' : ''}`}
              onClick={() => {
                setActiveId(conversation.id)
                setPanel('chat')
                setMobileNav(false)
              }}
              title={conversation.title}
            >
              <span>◌</span>
              <span className="history-title">{conversation.title}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="prototype-note">
            <span className="note-icon">i</span>
            <div>
              <strong>Environnement prototype</strong>
              <p>Les données de démonstration ne sont pas des données officielles BaSYS.</p>
            </div>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">BA</div>
            <div className="profile-text">
              <strong>Assistant documentaire</strong>
              <span>Prototype local</span>
            </div>
            <span className="profile-dots">···</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu"
              aria-label="Ouvrir la navigation"
              onClick={() => setMobileNav(true)}
            >
              ☰
            </button>
            <div className="breadcrumb">
              <span>Workspace</span><span className="crumb-separator">/</span>
              <strong>{panel === 'chat' ? 'Assistant' : 'Documents'}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <span className={`status-dot ${health && !healthError ? 'status-online' : 'status-offline'}`} />
            <span className="status-text">
              {health && !healthError ? 'API accessible' : 'API indisponible'}
            </span>
            <span className="topbar-divider" />
            <span className="environment-label">LOCAL</span>
          </div>
        </header>

        <div className="prototype-banner">
          <span>ⓘ</span>
          <p>
            <strong>Prototype de démonstration.</strong> Les réponses s’appuient
            sur la base documentaire locale, qui contient des exemples fictifs.
          </p>
        </div>

        {panel === 'documents' ? (
          <section className="documents-page">
            <div className="page-heading">
              <div className="eyebrow">CENTRE DE CONNAISSANCES</div>
              <h1>Base documentaire</h1>
              <p>Recherche les documents disponibles dans la base du prototype.</p>
            </div>

            <form className="document-search" onSubmit={searchDocuments}>
              <span>⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ex. maintenance, équipement, intervention…"
                maxLength={100}
              />
              <button type="submit" disabled={searchBusy}>
                {searchBusy ? 'Recherche…' : 'Rechercher'}
              </button>
            </form>

            {searchError && <div className="error-banner">{searchError}</div>}

            {documents.length > 0 && (
              <div className="results-count">
                {documents.length} résultat{documents.length > 1 ? 's' : ''}
              </div>
            )}

            <div className="document-grid">
              {documents.map((document) => (
                <article className="document-card" key={document.slug}>
                  <div className="document-card-top">
                    <span className="document-icon">▤</span>
                    <span className="category-tag">{document.category}</span>
                  </div>
                  <h3>{document.title}</h3>
                  <p>{document.content}</p>
                  <div className="document-card-footer">
                    <span>{document.source}</span>
                    <button onClick={() => {
                      setInput(`Résume le document « ${document.title} ».`)
                      setPanel('chat')
                      setActiveId(null)
                    }}>
                      Interroger l’assistant ↗
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {!searchBusy && documents.length === 0 && !searchError && (
              <div className="documents-empty">
                <div className="empty-icon">⌕</div>
                <h3>Explore les connaissances disponibles</h3>
                <p>Recherche par sujet, catégorie ou mot-clé pour retrouver les documents pertinents.</p>
              </div>
            )}
          </section>
        ) : (
          <>
            <section className={`chat-area ${activeConversation?.messages.length ? 'chat-area-active' : ''}`}>
              {!activeConversation || activeConversation.messages.length === 0 ? (
                <div className="welcome">
                  <div className="welcome-icon"><span>✳</span></div>
                  <div className="eyebrow">TON ASSISTANT DOCUMENTAIRE</div>
                  <h1>Comment puis-je<br /><span>t’aider aujourd’hui ?</span></h1>
                  <p className="welcome-description">
                    Pose une question sur la maintenance, les équipements
                    ou les documents présents dans la base de démonstration.
                  </p>
                  <div className="suggestions">
                    {suggestions.map((suggestion) => (
                      <button
                        className="suggestion-card"
                        key={suggestion.title}
                        onClick={() => void sendMessage(suggestion.text)}
                        disabled={busy}
                      >
                        <span className="suggestion-icon">{suggestion.icon}</span>
                        <span className="suggestion-title">{suggestion.title}</span>
                        <span className="suggestion-text">{suggestion.text}</span>
                        <span className="suggestion-arrow">↗</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="messages">
                  <div className="conversation-heading">
                    <div className="eyebrow">CONVERSATION</div>
                    <h2>{activeConversation.title}</h2>
                  </div>
                  {activeConversation.messages.map((message) => (
                    <article className={`message message-${message.role}`} key={message.id}>
                      <div className={`message-avatar ${message.role === 'assistant' ? 'assistant-avatar' : ''}`}>
                        {message.role === 'assistant' ? '✳' : 'U'}
                      </div>
                      <div className="message-body">
                        <div className="message-author">
                          {message.role === 'assistant' ? 'BaSYS Assistant' : 'Vous'}
                          {message.role === 'assistant' && (
                            <span className="answer-label">RÉPONSE IA</span>
                          )}
                        </div>
                        <div className={`message-content ${message.error ? 'message-error' : ''}`}>
                          {message.content || (
                            <span className="typing-indicator">
                              <i /><i /><i /> Analyse des documents en cours…
                            </span>
                          )}
                        </div>
                        {message.truncated && (
                          <div className="truncated-warning" role="alert">
                            <span className="truncated-icon">⚠</span>
                            <span>
                              {message.truncatedMessage ?? "La réponse est peut-être incomplète (limite de génération atteinte)."}
                            </span>
                          </div>
                        )}
                        {message.sources && message.sources.length > 0 && (
                          <div className="sources-section">
                            <button
                              className="sources-heading"
                              onClick={() => setExpandedSource(
                                expandedSource === message.id ? null : message.id,
                              )}
                            >
                              <span>▤</span>
                              {message.sources.length} source{message.sources.length > 1 ? 's' : ''} consultée{message.sources.length > 1 ? 's' : ''}
                              <span className="sources-chevron">
                                {expandedSource === message.id ? '−' : '+'}
                              </span>
                            </button>
                            {expandedSource === message.id && (
                              <div className="source-list">
                                {message.sources.map((source) => (
                                  <button
                                    type="button"
                                    className="source-item source-item-button"
                                    key={source.slug}
                                    onClick={() => void openDocument(source.slug)}
                                  >
                                    <span className="source-file-icon">▤</span>
                                    <span className="source-info">
                                      <strong>{source.title}</strong>
                                      <span>{source.category} · {source.source}</span>
                                      <span className="source-open-hint">Lire le document ↗</span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {message.error && (
                          <button className="retry-button" onClick={() => void sendMessage(
                            activeConversation.messages
                              .filter((item) => item.role === 'user')
                              .at(-1)?.content ?? '',
                          )}>
                            Réessayer ↻
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                  {busy && (
                    <div className="generation-note">
                      <span className="generation-spinner" />
                      Le modèle local prépare sa réponse. Cela peut prendre un moment.
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </section>

            <div className="composer-wrap">
              {!activeConversation?.messages.length && (
                <div className="composer-hint">
                  <span>✳</span> Pose une question pour commencer
                </div>
              )}
              <form className="composer" onSubmit={handleSubmit}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Pose ta question sur les documents…"
                  rows={2}
                  maxLength={1000}
                  disabled={busy}
                  aria-label="Ta question"
                />
                <div className="composer-bottom">
                  <span className="composer-tip">Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne</span>
                  <div className="composer-actions">
                    <span className="character-count">{input.length}/1000</span>
                    <button
                      className="send-button"
                      type="submit"
                      disabled={busy || input.trim().length < 2}
                      aria-label="Envoyer le message"
                    >
                      {busy ? <span className="button-spinner" /> : '↑'}
                    </button>
                  </div>
                </div>
              </form>
              <p className="disclaimer">
                Les réponses peuvent être incomplètes. Vérifie les sources avant toute décision opérationnelle.
              </p>
            </div>
          </>
        )}
      {(
        documentBusy ||
        documentError ||
        selectedDocument
      ) && (
        <div
          className="document-viewer-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !documentBusy) {
              setSelectedDocument(null)
              setDocumentError('')
            }
          }}
        >
          <section
            className="document-viewer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-viewer-title"
          >
            <header className="document-viewer-header">
              <div>
                <span className="document-viewer-eyebrow">BASE DOCUMENTAIRE</span>
                <h2 id="document-viewer-title">
                  {selectedDocument?.title ?? (
                    documentBusy ? 'Chargement du document…' : 'Document indisponible'
                  )}
                </h2>
              </div>
              <button
                type="button"
                className="document-viewer-close"
                onClick={() => {
                  setSelectedDocument(null)
                  setDocumentError('')
                }}
                disabled={documentBusy}
                aria-label="Fermer le document"
              >
                ×
              </button>
            </header>

            {documentBusy && (
              <div className="document-viewer-status" role="status">
                Chargement du contenu…
              </div>
            )}

            {!documentBusy && documentError && (
              <div className="document-viewer-error" role="alert">
                {documentError}
              </div>
            )}

            {!documentBusy && selectedDocument && (
              <>
                <div className="document-viewer-meta">
                  <span className="category-tag">{selectedDocument.category}</span>
                  <span>{selectedDocument.source}</span>
                </div>

                {selectedDocument.tags?.length > 0 && (
                  <div className="document-viewer-tags">
                    {selectedDocument.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="document-tag-button"
                        onClick={() => {
                          setSearch(tag)
                          setPanel('documents')
                          setSelectedDocument(null)
                          setDocumentError('')
                          setSearchError('')
                          setDocuments([])
                          setMobileNav(false)
                          void searchDocumentsByQuery(tag)
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                <div className="document-viewer-content">
                  {selectedDocument.content}
                </div>

                <footer className="document-viewer-footer">
                  <span>Identifiant : {selectedDocument.slug}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDocument(null)
                      setDocumentError('')
                    }}
                  >
                    Fermer
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
      </main>
    </div>
  )
}

export default App

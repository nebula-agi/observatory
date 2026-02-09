import { useState, useEffect } from "react"
import { useAuth } from "../hooks/useAuth"
import { Key, Check, Trash2, Eye, EyeOff } from "lucide-react"

const API_BASE = import.meta.env.VITE_API_URL || ""

const API_KEY_SERVICES = [
  { name: "supermemory", label: "Supermemory", category: "Provider" },
  { name: "mem0", label: "Mem0", category: "Provider" },
  { name: "zep", label: "Zep", category: "Provider" },
  { name: "nebula", label: "Nebula", category: "Provider" },
  { name: "openai", label: "OpenAI", category: "Model" },
  { name: "anthropic", label: "Anthropic", category: "Model" },
  { name: "google", label: "Google", category: "Model" },
] as const

export default function SettingsPage() {
  const { user, getToken, authEnabled } = useAuth()
  const [savedKeys, setSavedKeys] = useState<string[]>([])
  const [keyValues, setKeyValues] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    loadKeys()
  }, [user])

  async function loadKeys() {
    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/api/auth/keys`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setSavedKeys(data.keys || [])
      }
    } catch {
      // ignore
    }
  }

  async function saveKey(keyName: string) {
    const value = keyValues[keyName]
    if (!value?.trim()) return

    setSaving(keyName)
    setError(null)
    setSuccess(null)

    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/api/auth/keys/${keyName}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value: value.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save key")
      }

      setSavedKeys((prev) => (prev.includes(keyName) ? prev : [...prev, keyName]))
      setKeyValues((prev) => ({ ...prev, [keyName]: "" }))
      setSuccess(`${keyName} key saved`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save key")
    } finally {
      setSaving(null)
    }
  }

  async function deleteKey(keyName: string) {
    setSaving(keyName)
    setError(null)

    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/api/auth/keys/${keyName}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to delete key")
      }

      setSavedKeys((prev) => prev.filter((k) => k !== keyName))
      setSuccess(`${keyName} key deleted`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete key")
    } finally {
      setSaving(null)
    }
  }

  if (!authEnabled) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="font-display text-2xl font-medium text-text-primary mb-4">Settings</h1>
        <p className="text-text-secondary text-sm">
          Authentication is not configured. Set <code className="font-mono text-accent">VITE_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-accent">VITE_SUPABASE_ANON_KEY</code> to enable auth.
        </p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="font-display text-2xl font-medium text-text-primary mb-4">Settings</h1>
        <p className="text-text-secondary text-sm">Sign in to manage your API keys and settings.</p>
      </div>
    )
  }

  const providerKeys = API_KEY_SERVICES.filter((s) => s.category === "Provider")
  const modelKeys = API_KEY_SERVICES.filter((s) => s.category === "Model")

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="font-display text-2xl font-medium text-text-primary mb-6">Settings</h1>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400 flex items-center gap-2">
          <Check className="w-4 h-4" />
          {success}
        </div>
      )}

      <section className="mb-8">
        <h2 className="font-display text-lg font-medium text-text-primary mb-1">Provider API Keys</h2>
        <p className="text-xs text-text-muted mb-4">
          Keys for memory layer providers. Used when running benchmarks.
        </p>
        <div className="space-y-3">
          {providerKeys.map((service) => (
            <KeyRow
              key={service.name}
              service={service}
              isSaved={savedKeys.includes(service.name)}
              value={keyValues[service.name] || ""}
              show={showKey[service.name] || false}
              saving={saving === service.name}
              onChange={(v) => setKeyValues((prev) => ({ ...prev, [service.name]: v }))}
              onToggleShow={() => setShowKey((prev) => ({ ...prev, [service.name]: !prev[service.name] }))}
              onSave={() => saveKey(service.name)}
              onDelete={() => deleteKey(service.name)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-medium text-text-primary mb-1">Model API Keys</h2>
        <p className="text-xs text-text-muted mb-4">
          Keys for judge and answering models (OpenAI, Anthropic, Google).
        </p>
        <div className="space-y-3">
          {modelKeys.map((service) => (
            <KeyRow
              key={service.name}
              service={service}
              isSaved={savedKeys.includes(service.name)}
              value={keyValues[service.name] || ""}
              show={showKey[service.name] || false}
              saving={saving === service.name}
              onChange={(v) => setKeyValues((prev) => ({ ...prev, [service.name]: v }))}
              onToggleShow={() => setShowKey((prev) => ({ ...prev, [service.name]: !prev[service.name] }))}
              onSave={() => saveKey(service.name)}
              onDelete={() => deleteKey(service.name)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

interface KeyRowProps {
  service: { name: string; label: string }
  isSaved: boolean
  value: string
  show: boolean
  saving: boolean
  onChange: (value: string) => void
  onToggleShow: () => void
  onSave: () => void
  onDelete: () => void
}

function KeyRow({ service, isSaved, value, show, saving, onChange, onToggleShow, onSave, onDelete }: KeyRowProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 w-28 flex-shrink-0">
        <Key className="w-4 h-4 text-text-muted" />
        <span className="text-sm text-text-primary font-medium">{service.label}</span>
      </div>

      {isSaved && !value ? (
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs text-green-400 flex items-center gap-1">
            <Check className="w-3 h-3" /> Saved
          </span>
          <div className="flex-1" />
          <button
            onClick={onDelete}
            disabled={saving}
            className="p-1 text-text-muted hover:text-red-400 transition-colors cursor-pointer"
            title="Remove key"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={show ? "text" : "password"}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={isSaved ? "Enter new key to update" : "Enter API key"}
              className="w-full px-3 py-1.5 bg-bg-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent pr-8 font-mono"
            />
            <button
              onClick={onToggleShow}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
            >
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            onClick={onSave}
            disabled={saving || !value.trim()}
            className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? "..." : "Save"}
          </button>
          {isSaved && (
            <button
              onClick={() => onChange("")}
              className="text-xs text-text-muted hover:text-text-primary cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}

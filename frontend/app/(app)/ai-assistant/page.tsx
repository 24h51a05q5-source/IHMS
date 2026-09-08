'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Bot,
  User,
  Send,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Trash2,
  CheckCircle2,
  XCircle,
  Settings2,
  Lock,
  ArrowRight,
  PlusCircle,
  Loader2,
} from 'lucide-react';
import {
  aiAssistantApi,
  AiAssistantResponse,
  ActionConfirmationProposal,
  OwnerAiPreference,
} from '@/lib/api/ai-assistant.api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  category?: string;
  accessLevel?: string;
  confirmationProposal?: ActionConfirmationProposal;
  confirmationStatus?: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  suggestedFollowUps?: string[];
  denialReason?: string;
  timestamp: string;
}

export default function OwnerAiAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text:
        "Hello! I'm your IHMS AI Assistant for Hostel Operations. You can ask me anything about vacant beds, occupancy, student records, outstanding fees, recent payments, or maintenance complaints in natural language.",
      category: 'UNKNOWN',
      accessLevel: 'LEVEL_1_READ',
      suggestedFollowUps: [
        'How many beds are vacant?',
        'Show unpaid students',
        'Hostel occupancy summary',
        'Recent payment transactions',
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmingToken, setConfirmingToken] = useState<string | null>(null);

  // Preferences Modal State
  const [isPrefModalOpen, setIsPrefModalOpen] = useState(false);
  const [preferences, setPreferences] = useState<OwnerAiPreference[]>([]);
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [savingPref, setSavingPref] = useState(false);
  const [prefError, setPrefError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (promptToSend?: string) => {
    const text = (promptToSend || input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptToSend) setInput('');
    setLoading(true);

    try {
      const res: AiAssistantResponse = await aiAssistantApi.chat(text);
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: res.message,
        category: res.category,
        accessLevel: res.accessLevel,
        confirmationProposal: res.confirmationProposal,
        confirmationStatus: res.confirmationRequired ? 'PENDING' : undefined,
        suggestedFollowUps: res.suggestedFollowUps,
        denialReason: res.denialReason,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `Error processing request: ${err?.message || 'Unable to connect to AI Assistant service.'}`,
        accessLevel: 'LEVEL_3_RESTRICTED',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async (msgId: string, token: string, confirm: boolean) => {
    setConfirmingToken(token);
    try {
      const res = await aiAssistantApi.confirmAction(token, confirm);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                confirmationStatus: confirm ? 'CONFIRMED' : 'CANCELLED',
              }
            : m
        )
      );

      // Append confirmation result message
      const followUpMsg: ChatMessage = {
        id: `status-${Date.now()}`,
        sender: 'assistant',
        text: res.message,
        category: res.category,
        accessLevel: res.accessLevel,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, followUpMsg]);
    } catch (err: any) {
      alert(`Action failed: ${err.message || err}`);
    } finally {
      setConfirmingToken(null);
    }
  };

  const loadPreferences = async () => {
    setLoadingPrefs(true);
    setPrefError(null);
    try {
      const res = await aiAssistantApi.getPreferences();
      setPreferences(res.preferences || []);
    } catch (err: any) {
      setPrefError(err.message || 'Failed to load preferences.');
    } finally {
      setLoadingPrefs(false);
    }
  };

  const handleSavePref = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;

    setSavingPref(true);
    setPrefError(null);
    try {
      await aiAssistantApi.savePreference(newKey.trim(), newValue.trim(), 'TERMINOLOGY');
      setNewKey('');
      setNewValue('');
      await loadPreferences();
    } catch (err: any) {
      setPrefError(err.message || 'Failed to save preference.');
    } finally {
      setSavingPref(false);
    }
  };

  const handleDeletePref = async (id: string) => {
    try {
      await aiAssistantApi.deletePreference(id);
      await loadPreferences();
    } catch (err: any) {
      alert(err.message || 'Failed to delete preference.');
    }
  };

  const handleResetPrefs = async () => {
    if (!confirm('Are you sure you want to reset all learned preferences and memory for the AI Assistant?')) {
      return;
    }
    try {
      await aiAssistantApi.resetPreferences();
      await loadPreferences();
    } catch (err: any) {
      alert(err.message || 'Failed to reset memory.');
    }
  };

  const quickPrompts = [
    'How many beds are vacant?',
    'Show unpaid students',
    'Hostel occupancy summary',
    'Recent payment transactions',
    'Pending maintenance complaints',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-5xl mx-auto p-4 md:p-6 gap-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-sm">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Owner AI Assistant
              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Controlled & Protected
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Intelligent IHMS operator with strict permissions & two-step confirmation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsPrefModalOpen(true);
              loadPreferences();
            }}
            className="text-xs gap-1.5"
          >
            <Settings2 className="w-3.5 h-3.5" />
            AI Memory & Learning
          </Button>
        </div>
      </div>

      {/* Security Boundaries Banner */}
      <div className="bg-muted/40 rounded-lg p-2.5 px-3.5 text-xs text-muted-foreground flex items-center justify-between border border-border/50">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Security Boundary:</strong> Read-only summaries (Level 1) & confirmed operations (Level 2) permitted. Receipts, credentials & payment modifications (Level 3) are strictly restricted.
          </span>
        </div>
      </div>

      {/* Quick Prompts Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Suggested:</span>
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSend(prompt)}
            disabled={loading}
            className="text-xs whitespace-nowrap bg-background hover:bg-muted border border-border px-3 py-1 rounded-full text-foreground/80 hover:text-foreground transition-colors shadow-2xs"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Thread */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.sender === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-2xl rounded-2xl p-4 shadow-2xs text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-xs'
                  : msg.accessLevel === 'LEVEL_3_RESTRICTED'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-foreground border border-amber-300 dark:border-amber-800 rounded-tl-xs'
                  : 'bg-card text-card-foreground border border-border/70 rounded-tl-xs'
              }`}
            >
              {/* Category & Access Pill */}
              {msg.sender === 'assistant' && (
                <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border/40 text-xs">
                  <div className="flex items-center gap-1.5">
                    {msg.accessLevel === 'LEVEL_3_RESTRICTED' ? (
                      <span className="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Restricted Operation
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" /> {msg.category || 'IHMS Assistant'}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
                </div>
              )}

              {/* Message Text */}
              <div className="whitespace-pre-wrap">{msg.text}</div>

              {/* Confirmation Card for Level 2 Operations */}
              {msg.confirmationProposal && (
                <div className="mt-3.5 p-3.5 rounded-xl bg-background border-2 border-primary/30 shadow-xs">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> Action Confirmation Required
                  </div>

                  {msg.confirmationStatus === 'PENDING' && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                        disabled={confirmingToken === msg.confirmationProposal.token}
                        onClick={() =>
                          handleConfirmAction(msg.id, msg.confirmationProposal!.token, true)
                        }
                      >
                        {confirmingToken === msg.confirmationProposal.token ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Confirm Action
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30 gap-1"
                        disabled={confirmingToken === msg.confirmationProposal.token}
                        onClick={() =>
                          handleConfirmAction(msg.id, msg.confirmationProposal!.token, false)
                        }
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel
                      </Button>
                    </div>
                  )}

                  {msg.confirmationStatus === 'CONFIRMED' && (
                    <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5 pt-1">
                      <CheckCircle2 className="w-4 h-4" /> This action was confirmed and executed.
                    </div>
                  )}

                  {msg.confirmationStatus === 'CANCELLED' && (
                    <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 pt-1">
                      <XCircle className="w-4 h-4" /> This action was cancelled.
                    </div>
                  )}
                </div>
              )}

              {/* Suggested Followups */}
              {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-border/40 flex flex-wrap gap-1.5">
                  {msg.suggestedFollowUps.map((item) => (
                    <button
                      key={item}
                      onClick={() => handleSend(item)}
                      disabled={loading}
                      className="text-xs bg-muted/60 hover:bg-muted text-foreground/80 px-2.5 py-0.5 rounded-full border border-border/40 transition-colors"
                    >
                      {item} →
                    </button>
                  ))}
                </div>
              )}
            </div>

            {msg.sender === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start items-center">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-card border border-border/70 rounded-2xl rounded-tl-xs p-3.5 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              Checking IHMS records...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-card border border-border/80 rounded-2xl p-2 shadow-sm flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={loading}
          placeholder="Ask anything (e.g. 'How many beds are vacant?', 'Show unpaid students', 'Move Rahul to Room 203')..."
          className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-hidden text-foreground placeholder:text-muted-foreground"
        />
        <Button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          size="icon"
          className="rounded-xl shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {/* AI Memory & Preferences Modal */}
      <Dialog open={isPrefModalOpen} onOpenChange={setIsPrefModalOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Owner AI Preferences & Memory
            </DialogTitle>
            <DialogDescription>
              The AI learns your preferred terminology, custom aliases, and format styles to tailor responses to your working patterns.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Privacy Alert */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
              <span>
                <strong>Privacy Protected:</strong> Passwords, OTPs, UPI IDs, bank account details, tokens, and credentials are automatically barred from memory.
              </span>
            </div>

            {prefError && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{prefError}</span>
              </div>
            )}

            {/* Add Custom Terminology Form */}
            <form onSubmit={handleSavePref} className="p-3.5 bg-muted/40 rounded-xl border border-border/70 space-y-3">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <PlusCircle className="w-3.5 h-3.5 text-primary" /> Teach New Terminology Alias
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1 font-medium">When I say (Alias):</label>
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder='e.g. "unpaid students"'
                    className="w-full bg-background border border-border px-2.5 py-1.5 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Understand as (Meaning):</label>
                  <input
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder='e.g. "students with outstanding fees"'
                    className="w-full bg-background border border-border px-2.5 py-1.5 rounded-lg text-xs"
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={savingPref || !newKey.trim() || !newValue.trim()} className="text-xs">
                {savingPref ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <PlusCircle className="w-3.5 h-3.5 mr-1" />}
                Save Terminology
              </Button>
            </form>

            {/* Existing Preferences List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Learned Preferences ({preferences.length})
                </h3>
                {preferences.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetPrefs}
                    className="text-xs text-destructive hover:bg-destructive/10 h-7 px-2"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Reset Memory
                  </Button>
                )}
              </div>

              {loadingPrefs ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading memory...
                </div>
              ) : preferences.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                  No custom preferences or terminology learned yet. Use the form above or continue chatting!
                </div>
              ) : (
                <div className="space-y-2">
                  {preferences.map((pref) => (
                    <div
                      key={pref.id}
                      className="p-2.5 bg-card border border-border rounded-xl flex items-center justify-between text-xs gap-2"
                    >
                      <div className="flex-1 overflow-hidden">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <span>&quot;{pref.key}&quot;</span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-primary font-normal">&quot;{pref.value}&quot;</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {pref.category}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleDeletePref(pref.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

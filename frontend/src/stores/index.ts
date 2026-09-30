import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language, ChatMessage, Citation, BusinessProfile, RoadmapStep, Roadmap, ProfileQuestion } from '../types';

interface ChatStore {
  currentConversationId: string | null;
  messages: ChatMessage[];
  draftMessage: string;
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  mode: 'general' | 'consumer';
  setCurrentConversationId: (id: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setDraftMessage: (draft: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setStreamingMessageId: (id: string | null) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;
  setMode: (mode: 'general' | 'consumer') => void;
  resetChat: () => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      currentConversationId: null,
      messages: [],
      draftMessage: '',
      isStreaming: false,
      streamingMessageId: null,
      streamingContent: '',
      mode: 'general',
      setCurrentConversationId: (id) => set({ currentConversationId: id }),
      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      updateMessage: (id, updates) => set((state) => ({
        messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      })),
      setDraftMessage: (draft) => set({ draftMessage: draft }),
      setIsStreaming: (isStreaming) => set({ isStreaming }),
      setStreamingMessageId: (id) => set({ streamingMessageId: id }),
      appendStreamingContent: (content) => set((state) => ({ streamingContent: state.streamingContent + content })),
      clearStreamingContent: () => set({ streamingContent: '' }),
      setMode: (mode) => set({ mode }),
      resetChat: () => set({
        currentConversationId: null,
        messages: [],
        draftMessage: '',
        isStreaming: false,
        streamingMessageId: null,
        streamingContent: '',
      }),
    }),
    {
      name: 'chat-store',
      partialize: (state) => ({ draftMessage: state.draftMessage, mode: state.mode }),
    }
  )
);

interface UIStore {
  language: Language;
  selectedCitation: Citation | null;
  sourcePanelOpen: boolean;
  rightPanelOpen: boolean;
  mobileSourcesOpen: boolean;
  setLanguage: (lang: Language) => void;
  setSelectedCitation: (citation: Citation | null) => void;
  setSourcePanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setMobileSourcesOpen: (open: boolean) => void;
  toggleRightPanel: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      language: 'en',
      selectedCitation: null,
      sourcePanelOpen: false,
      rightPanelOpen: true,
      mobileSourcesOpen: false,
      setLanguage: (language) => set({ language }),
      setSelectedCitation: (citation) => set({ selectedCitation: citation, sourcePanelOpen: !!citation }),
      setSourcePanelOpen: (open) => set({ sourcePanelOpen: open }),
      setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
      setMobileSourcesOpen: (open) => set({ mobileSourcesOpen: open }),
      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
    }),
    {
      name: 'ui-store',
      partialize: (state) => ({ language: state.language }),
    }
  )
);

interface ProfileStore {
  currentBusiness: BusinessProfile | null;
  profileQuestions: ProfileQuestion[];
  setCurrentBusiness: (business: BusinessProfile | null) => void;
  setProfileQuestions: (questions: ProfileQuestion[]) => void;
  updateBusinessField: (field: string, value: string | number) => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  currentBusiness: null,
  profileQuestions: [],
  setCurrentBusiness: (business) => set({ currentBusiness: business }),
  setProfileQuestions: (questions) => set({ profileQuestions: questions }),
  updateBusinessField: (field, value) => set((state) => ({
    currentBusiness: state.currentBusiness ? { ...state.currentBusiness, [field]: value } : null,
  })),
}));

interface RoadmapStore {
  currentRoadmap: Roadmap | null;
  openStepDrawer: RoadmapStep | null;
  setCurrentRoadmap: (roadmap: Roadmap | null) => void;
  setOpenStepDrawer: (step: RoadmapStep | null) => void;
  updateStepStatus: (stepId: string, status: RoadmapStep['status']) => void;
}

export const useRoadmapStore = create<RoadmapStore>((set) => ({
  currentRoadmap: null,
  openStepDrawer: null,
  setCurrentRoadmap: (roadmap) => set({ currentRoadmap: roadmap }),
  setOpenStepDrawer: (step) => set({ openStepDrawer: step }),
  updateStepStatus: (stepId, status) => set((state) => ({
    currentRoadmap: state.currentRoadmap ? {
      ...state.currentRoadmap,
      phases: state.currentRoadmap.phases.map((phase) => ({
        ...phase,
        steps: phase.steps.map((step) =>
          step.id === stepId ? { ...step, status } : step
        ),
      })),
      completedSteps: state.currentRoadmap.phases.flatMap((p) => p.steps).filter((s) => s.status === 'COMPLETED').length,
    } : null,
  })),
}));

interface AuthStore {
  user: { id: string; email: string; name: string } | null;
  isAuthenticated: boolean;
  setUser: (user: AuthStore['user']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-store',
    }
  )
);
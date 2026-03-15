import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { decodeAudioData, createBlob, decode } from '../utils/audio';

export const useGlyphLive = (apiKey: string) => {
    const [transcription, setTranscription] = useState("");
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [activeSection, setActiveSection] = useState<{ page: number; rect: number[] } | null>(null);

    const sessionRef = useRef<any>(null);
    const inputAudioCtxRef = useRef<AudioContext | null>(null);
    const outputAudioCtxRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    const clearAudioQueue = useCallback(() => {
        activeSourcesRef.current.forEach(src => { try { src.stop(); } catch (e) { } });
        activeSourcesRef.current.clear();
        if (outputAudioCtxRef.current) nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
        setIsSpeaking(false);
    }, []);

    const startSession = useCallback(async (instruction: string, docContext: string) => {
        const ai = new GoogleGenAI({ apiKey });

        inputAudioCtxRef.current = new AudioContext({ sampleRate: 16000 });
        outputAudioCtxRef.current = new AudioContext({ sampleRate: 24000 });

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        const session = await ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: instruction + " CONTEXT: " + docContext,
                tools: [{
                    functionDeclarations: [{
                        name: "focus_document_section",
                        description: "Highlight a section on a specific page.",
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                page: { type: Type.NUMBER },
                                rect: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                            },
                            required: ["page", "rect"]
                        }
                    }]
                }],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            },
            callbacks: {
                onopen: () => {
                    session.sendClientContent({
                        turns: [{ role: 'user', parts: [{ text: "I'm ready to begin the document analysis." }] }],
                        turnComplete: true
                    });

                    const source = inputAudioCtxRef.current!.createMediaStreamSource(stream);
                    const processor = inputAudioCtxRef.current!.createScriptProcessor(4096, 1, 1);
                    source.connect(processor);
                    processor.connect(inputAudioCtxRef.current!.destination);
                    processor.onaudioprocess = (e) => {
                        session.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) });
                    };
                },
                onmessage: async (m: any) => {
                    if (m.serverContent?.interrupted) clearAudioQueue();
                    if (m.serverContent?.outputTranscription) {
                        setTranscription(prev => prev + m.serverContent.outputTranscription.text);
                    }

                    const audio = m.serverContent?.modelTurn?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
                    if (audio && outputAudioCtxRef.current) {
                        setIsSpeaking(true);
                        const buf = await decodeAudioData(decode(audio), outputAudioCtxRef.current, 24000, 1);
                        const src = outputAudioCtxRef.current.createBufferSource();
                        src.buffer = buf;
                        src.connect(outputAudioCtxRef.current.destination);
                        const now = outputAudioCtxRef.current.currentTime;
                        const start = Math.max(now, nextStartTimeRef.current);
                        src.start(start);
                        nextStartTimeRef.current = start + buf.duration;
                        activeSourcesRef.current.add(src);
                        src.onended = () => {
                            activeSourcesRef.current.delete(src);
                            if (activeSourcesRef.current.size === 0) setIsSpeaking(false);
                        };
                    }

                    if (m.toolCall) {
                        for (const fc of m.toolCall.functionCalls) {
                            if (fc.name === 'focus_document_section') {
                                setActiveSection({ page: fc.args.page, rect: fc.args.rect });
                                session.sendToolResponse({
                                    functionResponses: [{ id: fc.id, name: fc.name, response: { result: "navigated" } }]
                                });
                            }
                        }
                    }
                }
            }
        });

        sessionRef.current = session;
    }, [apiKey, clearAudioQueue]);

    return { transcription, isSpeaking, activeSection, startSession };
};
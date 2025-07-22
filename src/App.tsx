
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { type Message, Sender, type Source } from './types';
import { BotIcon, UserIcon, SendIcon, LinkIcon } from './components/icons';

const TypingIndicator = () => (
    <div className="flex items-start gap-3 my-4">
        <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-gradient-to-r from-pink-500 to-violet-500 text-white">
            <BotIcon />
        </div>
        <div className="flex items-center space-x-1 p-4 bg-slate-700 rounded-2xl rounded-bl-none">
            <div className="h-2.5 w-2.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-2.5 w-2.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-2.5 w-2.5 bg-gray-400 rounded-full animate-bounce"></div>
        </div>
    </div>
);

interface ChatMessageProps {
    message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
    const isUser = message.sender === Sender.USER;
    return (
        <div className={`flex items-start gap-3 my-4 ${isUser ? 'flex-row-reverse' : ''}`}>
            <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-500 text-white' : 'bg-gradient-to-r from-pink-500 to-violet-500 text-white'}`}>
                {isUser ? <UserIcon /> : <BotIcon />}
            </div>
            <div className={`p-4 rounded-2xl max-w-[75%] ${isUser ? 'bg-blue-500 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
                <p className="whitespace-pre-wrap">{message.text}</p>
                {message.sources && message.sources.length > 0 && (
                    <div className="mt-4 border-t border-slate-600 pt-3">
                        <h4 className="text-xs font-bold text-slate-400 mb-2">Sources:</h4>
                        <div className="space-y-2">
                            {message.sources.map((source, index) => (
                                <a
                                    key={index}
                                    href={source.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-sm text-blue-400 hover:text-blue-300 truncate transition-colors duration-200"
                                >
                                    <LinkIcon />
                                    {source.title || source.uri}
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


export default function App() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMessages([
            {
                id: 'init',
                sender: Sender.BOT,
                text: "Hello! I'm Pride Travel, your personal AI assistant for LGBTQ+ travel. How can I help you plan your next fabulous adventure today? Feel free to ask me about Pride events!"
            }
        ]);
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = useCallback(async () => {
        if (!userInput.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            sender: Sender.USER,
            text: userInput.trim()
        };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setUserInput('');
        setIsLoading(true);
        
        const botMessageId = Date.now().toString() + '-bot';

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: newMessages.slice(0, -1) , message: userInput.trim() }),
            });

            if (!response.body) throw new Error("No response body");
            
            setMessages(prev => [...prev, { id: botMessageId, sender: Sender.BOT, text: '', sources: [] }]);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            let done = false;
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                const chunk = decoder.decode(value, { stream: true });
                
                // The last chunk from the function contains the sources
                if (done && chunk) {
                    try {
                        const finalPayload = JSON.parse(chunk);
                        setMessages(prev => prev.map(msg => msg.id === botMessageId ? { ...msg, sources: finalPayload.sources } : msg));
                    } catch (e) {
                         // It might not be JSON, just a final text chunk. Ignore parsing error.
                         setMessages(prev => prev.map(msg => msg.id === botMessageId ? { ...msg, text: msg.text + chunk } : msg));
                    }
                } else if (!done) {
                    setMessages(prev => prev.map(msg => msg.id === botMessageId ? { ...msg, text: msg.text + chunk } : msg));
                }
            }

        } catch (error) {
            console.error("Error sending message:", error);
            const errorMessage: Message = {
                id: Date.now().toString() + '-error',
                sender: Sender.BOT,
                text: "Oops! I'm having a little trouble connecting right now. Please try again in a moment."
            };
            setMessages(prev => prev.filter(msg => msg.id !== botMessageId).concat(errorMessage));
        } finally {
            setIsLoading(false);
        }
    }, [userInput, isLoading, messages]);

    return (
        <div className="bg-slate-900 font-sans w-full h-screen flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-2xl h-full flex flex-col bg-slate-800 shadow-2xl rounded-2xl border border-slate-700">
                <header className="p-4 flex items-center gap-4 border-b border-slate-700 bg-gradient-to-r from-pink-500 to-violet-500 rounded-t-2xl">
                    <BotIcon />
                    <div>
                        <h1 className="text-xl font-bold text-white">Pride Travel Assistant</h1>
                        <p className="text-sm text-violet-200">Online</p>
                    </div>
                </header>
                <main className="flex-1 p-4 overflow-y-auto">
                     {messages.map(msg => (
                        <ChatMessage key={msg.id} message={msg} />
                    ))}
                    {isLoading && <TypingIndicator />}
                    <div ref={messagesEndRef} />
                </main>
                <footer className="p-4 border-t border-slate-700">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSendMessage();
                        }}
                        className="flex items-center gap-3"
                    >
                        <input
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder="Ask about a Pride event..."
                            className="flex-1 bg-slate-700 text-white placeholder-slate-400 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 transition-shadow duration-200"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !userInput.trim()}
                            className="p-3 rounded-lg text-white bg-gradient-to-r from-pink-500 to-violet-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-200"
                        >
                            <SendIcon />
                        </button>
                    </form>
                </footer>
            </div>
        </div>
    );
}

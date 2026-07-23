'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Check, X, ChevronRight } from 'lucide-react';
import { api, SecurityQuestion } from '@/lib/api';

interface SecurityQuestionsProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export default function SecurityQuestions({ onComplete, onCancel }: SecurityQuestionsProps) {
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedQuestions, setSelectedQuestions] = useState<SecurityQuestion[]>([]);

  useEffect(() => {
    // Load random questions on mount
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      const randomQuestions = await api.getRandomSecurityQuestions(10);
      setQuestions(randomQuestions);
    } catch (e) {
      setError('Failed to load security questions');
    }
  };

  const handleQuestionSelect = (question: SecurityQuestion) => {
    if (selectedQuestions.length < 5 && !selectedQuestions.find(q => q.id === question.id)) {
      setSelectedQuestions([...selectedQuestions, question]);
    }
  };

  const handleQuestionRemove = (questionId: string) => {
    setSelectedQuestions(selectedQuestions.filter(q => q.id !== questionId));
    setAnswers(prev => {
      const newAnswers = { ...prev };
      delete newAnswers[questionId];
      return newAnswers;
    });
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    if (selectedQuestions.length < 5) {
      setError('Please select at least 5 security questions');
      return;
    }

    const answersArray = selectedQuestions.map(q => [q.id, answers[q.id] || '']);
    const emptyAnswers = answersArray.filter(([_, ans]) => !ans.trim());
    
    if (emptyAnswers.length > 0) {
      setError('Please provide answers for all selected questions');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.enrollSecurityAnswers(answersArray as [string, string][]);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save security questions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-vault-black/95 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl"
      >
        <div className="bg-vault-dark border border-vault-border/40 rounded-2xl p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-cyber-cyan to-cyber-purple flex items-center justify-center"
            >
              <Shield className="w-8 h-8 text-white" />
            </motion.div>
            <h2 className="text-2xl font-bold text-vault-light mb-2">
              Security Questions Setup
            </h2>
            <p className="text-sm text-vault-muted">
              Select 5 security questions and provide answers. These will help you recover your account if you forget your password.
            </p>
          </div>

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-xs text-vault-muted mb-2">
              <span>Questions Selected: {selectedQuestions.length}/5</span>
              <span>Answers Provided: {Object.values(answers).filter(a => a.trim()).length}/5</span>
            </div>
            <div className="h-2 bg-vault-black rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-cyber-cyan to-cyber-purple"
                initial={{ width: 0 }}
                animate={{ width: `${(selectedQuestions.length / 5) * 100}%` }}
              />
            </div>
          </div>

          {/* Step 1: Select Questions */}
          {currentStep === 0 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <h3 className="text-lg font-semibold text-vault-light mb-4">
                Select 5 Security Questions
              </h3>
              
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {questions.map((question) => {
                  const isSelected = selectedQuestions.find(q => q.id === question.id);
                  return (
                    <motion.button
                      key={question.id}
                      onClick={() => isSelected ? handleQuestionRemove(question.id) : handleQuestionSelect(question)}
                      disabled={selectedQuestions.length >= 5 && !isSelected}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-cyber-cyan/50 bg-cyber-cyan/10'
                          : 'border-vault-border/40 bg-vault-black/50 hover:border-vault-border/60'
                      } ${selectedQuestions.length >= 5 && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
                      whileHover={{ scale: isSelected ? 1 : 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-vault-light">{question.question}</p>
                          <p className="text-xs text-vault-muted mt-1">{question.category}</p>
                        </div>
                        {isSelected ? (
                          <Check className="w-5 h-5 text-cyber-cyan" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-vault-border/40" />
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              <div className="flex gap-3">
                {onCancel && (
                  <button
                    onClick={onCancel}
                    className="flex-1 py-3 rounded-xl border border-vault-border/40 text-vault-light hover:bg-vault-black/50 transition-colors"
                  >
                    Skip for Now
                  </button>
                )}
                <button
                  onClick={() => setCurrentStep(1)}
                  disabled={selectedQuestions.length < 5}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyber-cyan to-cyber-purple text-vault-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <ChevronRight className="inline w-4 h-4 ml-2" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Provide Answers */}
          {currentStep === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h3 className="text-lg font-semibold text-vault-light mb-4">
                Provide Your Answers
              </h3>

              <div className="space-y-4 max-h-64 overflow-y-auto mb-4">
                {selectedQuestions.map((question, index) => (
                  <motion.div
                    key={question.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <label className="block text-sm text-vault-light mb-2">
                      {index + 1}. {question.question}
                    </label>
                    <input
                      type="text"
                      value={answers[question.id] || ''}
                      onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm focus:outline-none focus:border-cyber-cyan/40 transition-colors"
                      placeholder="Your answer..."
                    />
                  </motion.div>
                ))}
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-3 rounded-lg bg-accent-danger/10 border border-accent-danger/20 text-accent-danger text-xs mb-4"
                >
                  {error}
                </motion.div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep(0)}
                  className="flex-1 py-3 rounded-xl border border-vault-border/40 text-vault-light hover:bg-vault-black/50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyber-cyan to-cyber-purple text-vault-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Complete Setup'}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

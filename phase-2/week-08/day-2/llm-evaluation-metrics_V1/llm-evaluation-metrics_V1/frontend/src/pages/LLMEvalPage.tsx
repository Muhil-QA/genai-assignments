import React from 'react';
import { LLMEvalForm } from '../components/LLMEval/LLMEvalForm';
import '../styles/testleaf-theme.css';
import '../styles/provider-toggle.css';

export const LLMEvalPage: React.FC = () => {
  return (
    <div className="llm-eval-page">
      {/* Header */}
      <div className="llm-eval-header">
        <img 
          src="https://assets.testleaf.com/assets/img/logo.svg" 
          alt="Testleaf Logo" 
          className="llm-eval-logo" 
        />
        <h1>Testleaf LLM Evaluation Framework</h1>
      </div>

      {/* Container */}
      <div className="llm-eval-container">
        <LLMEvalForm />
      </div>
    </div>
  );
};

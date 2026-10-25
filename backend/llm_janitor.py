"""
LLM Janitor for SnoozeOps.
Provides grounded natural-language explanations and safe proposed corrections using:
1. Open-weight Gemma (via local Ollama, Groq, OpenRouter, or Hugging Face Inference API)
2. Defensible deterministic reasoning engine fallback (transparently labeled)
"""

import os
import json
import httpx
from typing import List, Dict, Any, Optional, Tuple

class LLMJanitor:
    def __init__(self):
        # Configuration from environment or defaults
        self.provider = os.getenv("LLM_PROVIDER", "deterministic")  # "ollama", "groq", "openai_compatible", "huggingface", "deterministic"
        self.endpoint = os.getenv("LLM_ENDPOINT", "http://localhost:11434/api/generate")
        self.api_key = os.getenv("LLM_API_KEY", "")
        self.model = os.getenv("LLM_MODEL", "gemma2:2b")
        self.privacy_mode = "Zero Data Egress (Local Execution)" if self.provider in ["ollama", "deterministic"] else "External Model API (Flagged Snippet Only)"

    def update_config(self, provider: str, endpoint: Optional[str] = None, api_key: Optional[str] = None, model: Optional[str] = None):
        if provider:
            self.provider = provider
        if endpoint is not None:
            self.endpoint = endpoint
        if api_key is not None:
            self.api_key = api_key
        if model is not None:
            self.model = model
            
        self.privacy_mode = "Zero Data Egress (Local Execution)" if self.provider in ["ollama", "deterministic"] else "External Model API (Flagged Snippet Only)"

    def get_status(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "endpoint": self.endpoint,
            "model": self.model,
            "has_api_key": bool(self.api_key),
            "privacy_mode": self.privacy_mode
        }

    async def explain_and_propose_fixes(self, anomalies: List[Dict[str, Any]], df_context: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Enhances each anomaly with grounded explanations and proposed fixes.
        Never fakes LLM calls: if external API fails or is unconfigured, falls back
        cleanly and transparently labels each record as 'Deterministic Rules Fallback'.
        """
        if not anomalies:
            return [], {"engine": "none", "is_fallback": False}

        # Try live Gemma LLM if configured
        if self.provider in ["ollama", "groq", "openai_compatible", "huggingface"] and (self.provider == "ollama" or self.api_key):
            try:
                enhanced, meta = await self._call_gemma_model(anomalies, df_context)
                return enhanced, meta
            except Exception as e:
                # Transparent fallback
                enhanced, meta = self._deterministic_fallback(anomalies)
                meta["is_fallback"] = True
                meta["fallback_reason"] = f"Configured model '{self.model}' failed: {str(e)[:150]}. Used deterministic janitor."
                return enhanced, meta

        # Default deterministic engine
        enhanced, meta = self._deterministic_fallback(anomalies)
        return enhanced, meta

    def _deterministic_fallback(self, anomalies: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Grounded rule-based reasoning engine.
        Produces explainable, domain-grounded explanations and safe fixes with 100% transparency.
        """
        enhanced = []
        for item in anomalies:
            row_idx = item.get("row_index")
            col = item.get("column")
            val = item.get("value")
            detector = item.get("detector", "Anomaly Detector")
            existing_reason = item.get("reason", "")
            action = item.get("suggested_action", "FLAG_FOR_AUDIT")
            proposed = item.get("proposed_value")
            severity = item.get("severity", "Medium")
            confidence = item.get("confidence", 0.90)

            # Build grounded narrative explanation
            grounded_explanation = existing_reason
            if "Decimal Point Shift" in detector:
                grounded_explanation = (
                    f"Statistical analysis flagged cell '{col}' (value: {val}) as exceeding 50x the column median. "
                    f"In spreadsheet data entry, this commonly occurs when decimals are omitted during typing. "
                    f"Safe fix: Divide by 100 to restore true currency scaling to {proposed}."
                )
            elif "Domain Constraint (Non-Negative)" in detector:
                grounded_explanation = (
                    f"Column '{col}' represents a strictly non-negative quantity, but found {val}. "
                    f"This typically indicates an accidental minus sign or a return order incorrectly keyed as a purchase. "
                    f"Safe fix: Convert negative value to absolute positive {proposed} or nullify."
                )
            elif "RFC Email Syntax" in detector:
                grounded_explanation = (
                    f"The customer email '{val}' lacks a valid domain structure or '@' delimiter required by RFC 5322. "
                    f"Safe fix: Nullify invalid contact entry to avoid CRM bounce."
                )
            elif "Temporal Sanity" in detector:
                grounded_explanation = (
                    f"The date value '{val}' is placed decades into the future. Likely a year-digit typo. "
                    f"Safe fix: Roll back year to current calendar year {proposed}."
                )
            elif "Categorical Typo" in detector:
                grounded_explanation = (
                    f"The value '{val}' has a Levenshtein distance <= 2 from standard category '{proposed}'. "
                    f"Safe fix: Standardize spelling to official category '{proposed}'."
                )
            elif "Multivariate" in detector or "Revenue Formula" in detector:
                grounded_explanation = (
                    f"Mathematical relationship failed: {existing_reason}. "
                    f"Safe fix: Recompute calculated cell using formula inputs to {proposed}."
                )
            elif "Duplicate" in detector:
                grounded_explanation = (
                    f"Row {row_idx} is a byte-for-byte exact duplicate of an existing record. "
                    f"Safe fix: Drop duplicated row to preserve distinct entity integrity."
                )
            elif "TabPFN" in detector:
                grounded_explanation = (
                    f"TabPFN prior-fitted neural network detected an unexpected conditional residual. {existing_reason} "
                    f"Safe fix: Align value closer to TabPFN posterior expectation {proposed}."
                )

            enhanced.append({
                "row_index": row_idx,
                "column": col,
                "original_value": val,
                "detector": detector,
                "severity": severity,
                "confidence": confidence,
                "explanation": grounded_explanation,
                "suggested_action": action,
                "proposed_value": proposed,
                "engine_source": "Deterministic Janitor Engine (Rule-Based)",
                "is_fallback": True
            })

        meta = {
            "engine": "Deterministic Rules Engine",
            "model_name": "snoozeops-deterministic-v1.0",
            "is_fallback": True,
            "privacy_mode": "Zero Data Egress (100% Local)"
        }
        return enhanced, meta

    async def _call_gemma_model(self, anomalies: List[Dict[str, Any]], df_context: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Calls live Gemma model with strict structured output.
        """
        prompt = (
            f"You are SnoozeOps, an expert AI spreadsheet data janitor.\n"
            f"Given these {len(anomalies)} flagged data anomalies, provide a concise explanation and safe correction.\n"
            f"Context: {json.dumps(df_context.get('columns_summary', []))}\n"
            f"Anomalies: {json.dumps(anomalies[:10])}\n\n"
            f"Return JSON list where each object has: row_index, column, explanation, suggested_action, proposed_value, confidence."
        )

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        async with httpx.AsyncClient(timeout=10.0) as client:
            if self.provider == "ollama":
                resp = await client.post(
                    self.endpoint,
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json"
                    }
                )
                resp.raise_for_status()
                data = resp.json()
                raw_text = data.get("response", "{}")
            else:
                # OpenAI/Groq compatible
                resp = await client.post(
                    self.endpoint,
                    headers=headers,
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": "You are SnoozeOps AI data janitor. Output valid JSON only."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.1
                    }
                )
                resp.raise_for_status()
                data = resp.json()
                raw_text = data["choices"][0]["message"]["content"]

        # Parse LLM response
        parsed = json.loads(raw_text)
        if isinstance(parsed, dict) and "anomalies" in parsed:
            parsed = parsed["anomalies"]
        
        enhanced = []
        for i, item in enumerate(anomalies):
            ai_item = parsed[i] if isinstance(parsed, list) and i < len(parsed) else {}
            enhanced.append({
                "row_index": item.get("row_index"),
                "column": item.get("column"),
                "original_value": item.get("value"),
                "detector": item.get("detector"),
                "severity": item.get("severity"),
                "confidence": ai_item.get("confidence", item.get("confidence", 0.92)),
                "explanation": ai_item.get("explanation", item.get("reason")),
                "suggested_action": ai_item.get("suggested_action", item.get("suggested_action")),
                "proposed_value": ai_item.get("proposed_value", item.get("proposed_value")),
                "engine_source": f"Gemma Live ({self.model})",
                "is_fallback": False
            })

        meta = {
            "engine": f"Gemma ({self.model})",
            "model_name": self.model,
            "is_fallback": False,
            "privacy_mode": self.privacy_mode
        }
        return enhanced, meta

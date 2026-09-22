"""
Laya Local System 1 Server for JevGuard

Exposes a non-autoregressive "System 1" REST endpoint at http://127.0.0.1:8000/system-one
compatible with JevGuard's SystemOneClient interface.
"""

import sys
import os
import argparse
import time

def check_and_install_deps():
    import subprocess
    print("[1/2] Installing required packages (laya, fastapi, uvicorn)...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "laya", "fastapi", "uvicorn"])
    print("[2/2] Dependencies installed successfully.\n")

def main():
    parser = argparse.ArgumentParser(description="Run local Laya System 1 Server for JevGuard")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host (default: 127.0.0.1)")
    parser.add_argument("--model", type=str, default="convaiinnovations/laya", help="HuggingFace model checkpoint")
    parser.add_argument("--install", action="store_true", help="Auto-install dependencies if missing")
    args = parser.parse_args()

    # Verify imports
    try:
        import laya
        from fastapi import FastAPI, Request, HTTPException
        from fastapi.responses import JSONResponse
        import uvicorn
    except ImportError as e:
        if args.install:
            check_and_install_deps()
            import laya
            from fastapi import FastAPI, Request, HTTPException
            from fastapi.responses import JSONResponse
            import uvicorn
        else:
            print(f"\n[Missing Dependency: {e}]")
            print("Run with --install to install automatically:")
            print(f"  {sys.executable} scripts/laya_server.py --install\n")
            print("Or run manually:")
            print(f"  pip install laya fastapi uvicorn\n")
            sys.exit(1)

    print("==================================================================")
    print(f"  Initializing Convai Laya System 1 Model: {args.model}")
    print("==================================================================")
    
    started = time.time()
    try:
        agent = laya.load(args.model)
        load_time = round((time.time() - started) * 1000)
        print(f"Model loaded into memory in {load_time}ms.\n")
    except Exception as e:
        print(f"\n[Error loading Laya model]: {e}")
        print("Note: First run will download model weights from Hugging Face.")
        sys.exit(1)

    app = FastAPI(title="Laya System 1 Server", version="1.0.0")

    @app.get("/health")
    async def health():
        return {"status": "ok", "model": args.model, "engine": "laya-system-1"}

    @app.post("/system-one")
    async def system_one(request: Request):
        try:
            body = await request.json()
            state = body.get("state", {})
            questions = body.get("questions", [])

            input_text = ""
            if state.get("prompt"):
                input_text += f"Prompt: {state['prompt']}\n"
            input_text += f"Response: {state.get('response', '')}"

            # Convert JevGuard question list to Laya's question dictionary
            laya_questions = {}
            for i, q in enumerate(questions):
                q_id = f"q_{i}"
                q_type = q.get("type", "noul")
                q_text = q.get("text", "")
                
                if q_type == "noul":
                    laya_questions[q_id] = {
                        "type": "noul",
                        "instructions": q_text
                    }
                elif q_type == "score":
                    laya_questions[q_id] = {
                        "type": "score",
                        "instructions": q_text,
                        "criteria": q.get("criteria", [0, 1, 2])
                    }
                elif q_type == "choice":
                    laya_questions[q_id] = {
                        "type": "choice",
                        "instructions": q_text,
                        "criteria": q.get("choices", ["yes", "no"])
                    }

            # Single non-autoregressive forward pass (~33ms on local GPU)
            inference_start = time.time()
            predictions = agent.predict(
                {"content": input_text},
                laya_questions
            )
            elapsed_ms = round((time.time() - inference_start) * 1000, 2)

            # Map predictions back to JevGuard answers array
            answers = []
            pred_answers = predictions.get("answers", {})
            for i, q in enumerate(questions):
                q_id = f"q_{i}"
                p = pred_answers.get(q_id, {})
                q_type = q.get("type", "noul")

                if q_type == "noul":
                    answers.append({
                        "type": "noul",
                        "noul": float(p.get("noul", 0.05))
                    })
                elif q_type == "score":
                    answers.append({
                        "type": "score",
                        "score": float(p.get("score", 0.0)),
                        "confidence": float(p.get("confidence", 0.95))
                    })
                elif q_type == "choice":
                    answers.append({
                        "type": "choice",
                        "choice": p.get("choice", "")
                    })

            return {
                "model": args.model,
                "answers": answers,
                "usage": {
                    "input_tokens": len(input_text.split()),
                    "output_tokens": len(answers)
                },
                "latencyMs": elapsed_ms
            }

        except Exception as err:
            raise HTTPException(status_code=500, detail=str(err))

    print(f"Starting Laya System 1 server at http://{args.host}:{args.port}")
    print(f"JevGuard endpoint ready at: http://{args.host}:{args.port}/system-one\n")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")

if __name__ == "__main__":
    main()

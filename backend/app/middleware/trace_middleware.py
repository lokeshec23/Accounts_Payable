import time
import json
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import os

# Setup trace logger
trace_logger = logging.getLogger("application_trace")
trace_logger.setLevel(logging.INFO)

# File handler for trace log
log_file = os.path.join(os.getcwd(), "application_trace.log")
handler = logging.FileHandler(log_file)
formatter = logging.Formatter('%(asctime)s | %(message)s')
handler.setFormatter(formatter)
trace_logger.addHandler(handler)

class TraceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # 1. Capture Request Info
        url = str(request.url)
        method = request.method
        client_host = request.client.host if request.client else "unknown"
        
        # Attempt to get body for POST/PUT/PATCH
        request_body = b""
        if method in ["POST", "PUT", "PATCH"]:
            request_body = await request.body()
            # We need to set the body again for the next handler
            # This is tricky with BaseHTTPMiddleware
            # Workaround: replace the receive method
            async def receive():
                return {"type": "http.request", "body": request_body}
            request._receive = receive

        # 2. Process Request
        response = await call_next(request)
        
        # 3. Capture Response Info
        process_time = time.time() - start_time
        status_code = response.status_code
        
        # Only read body if it's small and likely JSON/Text
        content_type = response.headers.get("content-type", "")
        is_json = "application/json" in content_type
        response_body = b""
        
        if is_json:
            async for chunk in response.body_iterator:
                response_body += chunk
                
            # Re-set body for the response
            response = Response(
                content=response_body,
                status_code=status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
        else:
            res_body_desc = f"Non-JSON Content ({content_type})"

        # 4. Format and Log Trace Entry
        try:
            req_body_desc = "Binary/Large"
            # Avoid parsing huge bodies
            if len(request_body) < 10000:
                content_type_req = request.headers.get("content-type", "")
                if "application/json" in content_type_req:
                    try:
                        req_body_desc = json.loads(request_body.decode()) if request_body else None
                    except:
                        req_body_desc = request_body.decode(errors='ignore') if request_body else None
                elif "multipart/form-data" in content_type_req:
                    req_body_desc = "Multipart Form Data (Files/Fields)"
                else:
                    req_body_desc = request_body.decode(errors='ignore')[:1000] if request_body else None

            if is_json:
                res_body_desc = "Binary/Large"
                if len(response_body) < 10000:
                    try:
                        res_body_desc = json.loads(response_body.decode()) if response_body else None
                    except:
                        res_body_desc = response_body.decode(errors='ignore') if response_body else None

            trace_data = {
                "method": method,
                "url": url,
                "client": client_host,
                "request_body": req_body_desc,
                "status_code": status_code,
                "response_body": res_body_desc,
                "duration_ms": round(process_time * 1000, 2)
            }
            
            trace_logger.info(json.dumps(trace_data))
            
        except Exception as e:
            trace_logger.error(f"Error logging trace: {str(e)}")

        return response

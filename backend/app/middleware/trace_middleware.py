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

# Setup error logger
error_logger = logging.getLogger("application_error")
error_logger.setLevel(logging.ERROR)

# File handler for trace log
log_file = os.path.join(os.getcwd(), "application_trace.log")
handler = logging.FileHandler(log_file)
formatter = logging.Formatter('%(asctime)s | %(message)s')
handler.setFormatter(formatter)
trace_logger.addHandler(handler)

# File handler for error log
error_file = os.path.join(os.getcwd(), "application_error.log")
error_handler = logging.FileHandler(error_file)
error_formatter = logging.Formatter('%(asctime)s | %(levelname)s | %(name)s | %(message)s')
error_handler.setFormatter(error_formatter)
error_logger.addHandler(error_handler)

# Setup GET response logger
get_logger = logging.getLogger("application_get")
get_logger.setLevel(logging.INFO)

get_log_file = os.path.join(os.getcwd(), "application_get_responses.log")
get_handler = logging.FileHandler(get_log_file)
get_formatter = logging.Formatter('%(asctime)s | %(message)s')
get_handler.setFormatter(get_formatter)
get_logger.addHandler(get_handler)


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
        try:
            response = await call_next(request)
        except Exception as e:
            import traceback
            error_data = {
                "method": method,
                "url": url,
                "client": client_host,
                "request_body": "Internal Error", # Will be logged in detail below if possible
                "error": str(e),
                "traceback": traceback.format_exc()
            }
            error_logger.error(f"Unhandled exception during request processing: {json.dumps(error_data)}")
            # Re-raise so FastAPI can handle it (usually results in 500)
            raise e
        
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
            # Avoid parsing huge bodies (limit to 1MB)
            if len(request_body) < 1000000:
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
                if len(response_body) < 1000000:
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
                "duration_s": round(process_time, 3)
            }
            
            trace_logger.info(json.dumps(trace_data))
            
            # 5. Log Errors separately if status code is >= 400
            if status_code >= 400:
                error_logger.error(f"Request failed with status {status_code}: {json.dumps(trace_data)}")
            
        except Exception as e:
            error_logger.error(f"Error logging trace: {str(e)}")
        # 6. Log GET API responses separately
        if method == "GET":                
            try:
                get_log_data = {
                    "url": url,
                    "query_params": dict(request.query_params),
                    "status_code": status_code,
                    "response_body": res_body_desc,
                    "duration_s": round(process_time, 3)
                }

                get_logger.info(json.dumps(get_log_data))

            except Exception as e:
                error_logger.error(f"Error logging GET response: {str(e)}")

        return response

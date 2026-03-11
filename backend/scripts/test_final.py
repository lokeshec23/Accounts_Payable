import pymssql
import logging
import os

# Set up logging to file
log_path = os.path.join(os.path.dirname(__file__), 'results.txt')
logging.basicConfig(filename=log_path, level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s - %(message)s', filemode='w')

passwords = ["Loandna@2026", "varshu@40067"]
servers = ["localhost", "127.0.0.1"]

logging.info("Starting DB connection tests...")

success = False
for server in servers:
    for pwd in passwords:
        logging.info(f"Testing connection to {server} with user 'sa' and password '{pwd}'...")
        try:
            conn = pymssql.connect(
                server=server,
                user='sa',
                password=pwd,
                database='master',
                login_timeout=5,
                autocommit=True
            )
            logging.info(f"SUCCESS! Connected to {server}")
            
            # Check if accounts_payable db exists
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sys.databases WHERE name = 'accounts_payable'")
            row = cursor.fetchone()
            if row:
                logging.info("Database 'accounts_payable' exists.")
            else:
                logging.warning("Database 'accounts_payable' NOT found.")
            
            conn.close()
            success = True
            break
        except Exception as e:
            logging.error(f"Failed to connect to {server} with password '{pwd}': {e}")
    if success: break

if not success:
    logging.critical("All connection attempts failed.")

logging.info("Test finished.")

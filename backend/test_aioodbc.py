import asyncio
import aioodbc

async def test_conn():
    conn_str = (
        r'DRIVER={SQL Server};'
        r'SERVER=127.0.0.1,1433;'
        r'DATABASE=Accounts_Payable;'
        r'UID=sa;'
        r'PWD=Loandna@2026;'
        r'TrustServerCertificate=yes;'
    )
    print(f"Testing async connection string: {conn_str}")
    try:
        conn = await aioodbc.connect(dsn=conn_str, timeout=5)
        print("Async connection successful!")
        cur = await conn.cursor()
        await cur.execute("SELECT @@VERSION")
        row = await cur.fetchone()
        print(f"SQL Server Version: {row[0]}")
        await cur.close()
        await conn.close()
    except Exception as e:
        print(f"Async connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_conn())

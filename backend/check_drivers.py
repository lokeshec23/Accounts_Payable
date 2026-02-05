import pyodbc
drivers = [d for d in pyodbc.drivers() if "SQL" in d]
print("Installed SQL Drivers:")
for d in drivers:
    print(f"- {d}")

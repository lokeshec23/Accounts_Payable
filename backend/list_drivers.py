import pyodbc
drivers = [x for x in pyodbc.drivers() if 'SQL Server' in x]
print("Available SQL Server Drivers:")
for driver in drivers:
    print(f"- {driver}")

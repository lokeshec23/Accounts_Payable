import pyodbc
existing_drivers = pyodbc.drivers()
sql_drivers = [d for d in existing_drivers if 'SQL Server' in d]
with open('available_drivers.txt', 'w') as f:
    f.write("Available SQL Server Drivers:\n")
    for d in sql_drivers:
        f.write(f"- {d}\n")
    f.write("\nAll drivers:\n")
    for d in existing_drivers:
        f.write(f"- {d}\n")
print("Done")

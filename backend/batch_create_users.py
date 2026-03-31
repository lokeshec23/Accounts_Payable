import sys
import os
from datetime import datetime

# Add the parent directory to the path so we can import 'app'
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database.database import SessionLocal
from app.models.db_models import User as UserDB
from app.auth.jwt import get_password_hash

def batch_create_users(users_list):
    """
    Creates multiple users in the database with the default password.
    users_list: List of dictionaries with 'username', 'email', 'role', 'status'
    """
    db = SessionLocal()
    try:
        # Default password hashed
        default_hashed_password = get_password_hash("Apex2026")
        
        created_count = 0
        skipped_count = 0
        
        for user_data in users_list:
            # Check if user already exists
            existing_user = db.query(UserDB).filter(
                (UserDB.email == user_data['email']) | 
                (UserDB.username == user_data['username'])
            ).first()
            
            if existing_user:
                print(f"Skipping: User with email {user_data['email']} or username {user_data['username']} already exists.")
                skipped_count += 1
                continue
                
            new_user = UserDB(
                username=user_data['username'],
                email=user_data['email'],
                password=default_hashed_password,
                role=user_data.get('role', 'approver'),
                status=user_data.get('status', 'active'),
                isCreatedByUser=False,
                createdby="admin",
                ispasswordchange=False,
                created_at=datetime.utcnow()
            )
            
            db.add(new_user)
            created_count += 1
            
        db.commit()
        print(f"\nSuccessfully created {created_count} users.")
        print(f"Skipped {skipped_count} users.")
        
    except Exception as e:
        db.rollback()
        print(f"Error during batch creation: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    # Example usage - modify this list as needed
    users_to_create = [
    {"username": "Amanda Foraker", "email": "AForaker@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Arvin Wijay", "email": "arvin@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Barbara", "email": "BGoodwin@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Brian Adams", "email": "BAdams@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Brian Gehl", "email": "brian@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Cory McCormack", "email": "CMcCormack@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Dana Gross", "email": "DGross@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Eric S. Uvaney", "email": "EUvaney@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Ilamurugu Mahamuni", "email": "IMahamuni@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Jana Setterberg", "email": "JSetterberg@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Jeffrey Rauland", "email": "JRauland@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Joni Neyland", "email": "jneyland@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Judy Hsu", "email": "JHsu@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Kimberly Horst", "email": "KHorst@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Kimberly Williams", "email": "KWilliams@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Lambert R. Cruz", "email": "LCruz@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Larisa Vitebskaya", "email": "LVitebskaya@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Lewis Ngo", "email": "lngo@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Lisa Stratton", "email": "LStratton@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Melissa Hill", "email": "MHill@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Michael S Chew", "email": "MChew@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Panneer Selvam", "email": "PSelvam@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Parameswaran Easwaran", "email": "PEaswaran@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Rudy Zabran", "email": "Rzabran@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Saravanan Thambusamy", "email": "SThambusamy@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Shelena Centeno", "email": "SCenteno@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Susan Christy", "email": "SChristy@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Whitney Bechert", "email": "WBechert@ca-usa.com", "role": "approver", "status": "active"},
    {"username": "Zachary Gribben", "email": "ZGribben@ca-usa.com", "role": "approver", "status": "active"},
]
    
    print("Starting batch user creation...")
    batch_create_users(users_to_create)
    print("Done.")

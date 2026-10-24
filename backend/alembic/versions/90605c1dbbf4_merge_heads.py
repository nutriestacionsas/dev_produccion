"""merge heads

Revision ID: 90605c1dbbf4
Revises: 6851d3205b3e, c2f4e8b1a9d3
Create Date: 2026-07-13 14:56:40.264986

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '90605c1dbbf4'
down_revision: Union[str, Sequence[str], None] = ('6851d3205b3e', 'c2f4e8b1a9d3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

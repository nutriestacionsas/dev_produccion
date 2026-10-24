"""Add produccion_establecida to orden_produccion_dias

Revision ID: c2f4e8b1a9d3
Revises: 301afd123b3a
Create Date: 2026-07-10 12:14:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2f4e8b1a9d3'
down_revision: Union[str, Sequence[str], None] = '301afd123b3a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add produccion_establecida column."""
    op.add_column('orden_produccion_dias',
        sa.Column('produccion_establecida', sa.Boolean(), nullable=True, server_default='false')
    )


def downgrade() -> None:
    """Remove produccion_establecida column."""
    op.drop_column('orden_produccion_dias', 'produccion_establecida')

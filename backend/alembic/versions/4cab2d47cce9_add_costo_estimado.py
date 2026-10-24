"""add costo estimado

Revision ID: 4cab2d47cce9
Revises: baa299872335
Create Date: 2026-08-26 13:22:59.741812

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4cab2d47cce9'
down_revision: Union[str, Sequence[str], None] = 'baa299872335'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('orden_produccion_dias', sa.Column('costo_estimado', sa.Float(), nullable=True, server_default='0.0'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('orden_produccion_dias', 'costo_estimado')
